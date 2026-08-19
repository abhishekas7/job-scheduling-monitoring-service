# Job Scheduling & Monitoring Service

A robust Node.js and MongoDB backend service for managing job scheduling, dispatching, and monitoring across multi-state runners with concurrency controls, idempotent retries, and persistent state recovery.

---

## Getting Started

### 1. Install Dependencies
Navigate to the `backend` directory and install project dependencies:
```bash
cd backend
npm install
```

### 2. Database Configuration
Create a `.env` file in the `backend` directory (if not already present):
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/job-scheduling-db
```

### 3. Seed Initial Data
Populate MongoDB with default runners, jobs, and audit event logs:
```bash
npm run seed
```

### 4. Start Development Server
```bash
npm run dev
```
The server will run at `http://localhost:5000`.

---

## Core Entities & States

### Job States
- `QUEUED`: Submitted and waiting to be claimed by an available idle runner.
- `CLAIMED`: Assigned to an idle runner with a 5-minute TTL claim.
- `RUNNING`: Acknowledged by the runner and currently executing.
- `CLEANUP`: Execution completed; runner performing teardown tasks.
- `COMPLETED`: Execution finished successfully.
- `FAILED`: Execution finished with an error.
- `CANCELLED`: Cancelled before or during execution.

### Runner States
- `OFFLINE`: Disconnected or unreachable.
- `IDLE`: Online, healthy, and ready to take a job.
- `CLAIMED`: Reserved for a queued job.
- `RUNNING`: Actively processing a job.
- `CLEANUP`: Performing post-job cleanup before returning to `IDLE`.
- `DRAINING`: Completing current work but accepting no new jobs.

---

## API Endpoints Reference

Base URL: `http://localhost:5000`

### Health Check

#### `GET /api/health`
Checks whether the backend server is running.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Backend is running"
}
```

---

### Job Management APIs (`/api/jobs`)

#### 1. `GET /api/jobs`
Fetch all jobs with optional filtering.

- **Query Parameters:**
  - `state` *(optional)*: Filter jobs by state (e.g., `QUEUED`, `RUNNING`, `COMPLETED`).
  - `runnerId` *(optional)*: Filter jobs assigned to a specific runner ID.

**Example Request:**
`GET /api/jobs?state=QUEUED`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Jobs fetched successfully",
  "data": [
    {
      "_id": "66c34a1...",
      "jobId": "job-001",
      "state": "QUEUED",
      "runnerId": null,
      "submittedAt": "2026-08-19T10:00:00.000Z",
      "payload": {}
    }
  ]
}
```

#### 2. `POST /api/jobs`
Submit a new job to the queue. Automatically triggers queue dispatching. Supports idempotent submission if identical `jobId` is passed.

**Request Body:**
```json
{
  "jobId": "job-101",
  "payload": {
    "task": "process_image",
    "url": "https://example.com/img.png"
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Job submitted successfully",
  "data": {
    "jobId": "job-101",
    "state": "QUEUED",
    "payload": {
      "task": "process_image",
      "url": "https://example.com/img.png"
    },
    "submittedAt": "2026-08-19T10:15:00.000Z"
  }
}
```

#### 3. `POST /api/jobs/:id/ack`
Acknowledge job start by a runner. Idempotently updates job state to `RUNNING`.

- **URL Parameters:**
  - `id`: Job ID or Mongo ObjectId.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Job acknowledged",
  "data": {
    "jobId": "job-101",
    "state": "RUNNING",
    "startedAt": "2026-08-19T10:15:05.000Z"
  }
}
```

#### 4. `POST /api/jobs/:id/finish`
Report job completion (`COMPLETED` or `FAILED`). Handled idempotently to safely tolerate retries.

- **URL Parameters:**
  - `id`: Job ID or Mongo ObjectId.

**Request Body:**
```json
{
  "status": "COMPLETED",
  "error": null
}
```
*(For failure: `"status": "FAILED"`, `"error": "Error message description"`)*

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Job status updated",
  "data": {
    "jobId": "job-101",
    "state": "COMPLETED",
    "finishedAt": "2026-08-19T10:16:00.000Z"
  }
}
```

#### 5. `POST /api/jobs/:id/cancel`
Cancel a job before or during execution. Safely releases any assigned runner.

- **URL Parameters:**
  - `id`: Job ID or Mongo ObjectId.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Job cancelled",
  "data": {
    "jobId": "job-101",
    "state": "CANCELLED",
    "finishedAt": "2026-08-19T10:16:30.000Z"
  }
}
```

---

### Runner Management APIs (`/api/runners`)

#### 1. `GET /api/runners`
Fetch all registered runners.

- **Query Parameters:**
  - `state` *(optional)*: Filter runners by state (e.g., `IDLE`, `RUNNING`, `DRAINING`).

**Example Request:**
`GET /api/runners?state=IDLE`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Runners fetched successfully",
  "data": [
    {
      "_id": "66c34b2...",
      "runnerId": "runner-a",
      "name": "Runner A",
      "state": "IDLE",
      "currentJobId": null,
      "lastHeartbeatAt": "2026-08-19T10:10:00.000Z"
    }
  ]
}
```

#### 2. `POST /api/runners/:id/online`
Bring a runner online, transitioning its state to `IDLE` and triggering queue dispatch for pending jobs.

- **URL Parameters:**
  - `id`: Runner ID or Mongo ObjectId.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Runner brought online successfully",
  "data": {
    "runnerId": "runner-a",
    "state": "IDLE",
    "currentJobId": null,
    "connectedAt": "2026-08-19T10:20:00.000Z"
  }
}
```

#### 3. `POST /api/runners/:id/drain`
Set a runner into `DRAINING` mode so it completes current work without picking up new queued jobs.

- **URL Parameters:**
  - `id`: Runner ID or Mongo ObjectId.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Runner set to draining mode successfully",
  "data": {
    "runnerId": "runner-a",
    "state": "DRAINING"
  }
}
```
