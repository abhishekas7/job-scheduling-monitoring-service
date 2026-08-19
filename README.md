# Job Scheduling & Monitoring Service

A robust Node.js and MongoDB backend service for managing job scheduling, dispatching, and monitoring across multi-state runners with strict concurrency controls, idempotent request retries, and persistent state recovery across service restarts.

---

## Key Requirement Compliance & Architecture

### R5: Single Job Assignment Concurrency Safeguard (Critical Requirement)
> **Requirement R5:** A runner must never be given two jobs at once. Jobs submitted at the exact same instant must not both find the same idle runner under concurrent load.

#### Concurrency Mechanism:
To guarantee correctness under heavy parallel load across multiple asynchronous threads or processes, our dispatch engine relies on a multi-tiered atomic locking mechanism:
1. **Atomic Compound Query (`findOneAndUpdate`)**: When dispatching a job, the scheduler does not use separate read-then-write steps. Instead, it issues a single atomic MongoDB `findOneAndUpdate` query:
   ```javascript
   await Runner.findOneAndUpdate(
     { _id: runnerId, state: "IDLE", currentJobId: null },
     { $set: { state: "CLAIMED", currentJobId: jobId, claimExpiresAt: new Date(Date.now() + 5000) } },
     { returnDocument: "after" }
   );
   ```
   Because MongoDB executes updates single-threaded per document, if two jobs attempt to claim the same idle runner simultaneously, exactly **one** update will succeed. The losing request receives `null` and instantly retries or yields, ensuring zero race conditions.

2. **Single-Job Invariant**: A runner is only eligible for assignment if `state == "IDLE"` **and** `currentJobId == null`. As soon as a job is claimed, `currentJobId` is atomically set, preventing any other concurrent operation from selecting that runner.

3. **In-Memory Queue Mutex**: Within each Node process instance, an internal execution flag (`this._isProcessing`) prevents overlapping queue dispatch loops from racing with themselves.

---

### R6: Idempotent Handling & Retries
> **Requirement R6:** Requests may be retried — the same job reported finished twice, or acknowledged after it was already cancelled. Handle it without corrupting state.

#### Mechanics:
1. **Duplicate Completion (`finishJob`)**:
   - If a runner or client calls `finishJob` on an already `COMPLETED` or `FAILED` job, the service returns the existing job state immediately without modifying timestamps or triggering redundant cleanup events.
2. **Finish / Ack on Cancelled Jobs**:
   - If a completion or start acknowledgement is received for a job that was already `CANCELLED`, the service preserves the `CANCELLED` state on the job while safely releasing the assigned runner (setting runner to `CLEANUP` / `IDLE`). An audit log event (`FINISH_RECEIVED_ON_CANCELLED_JOB`) is generated for visibility.
3. **Idempotent Job Creation**:
   - Submitting a job with an existing `jobId` returns the existing record rather than throwing duplicate key errors or corrupting state.

---

### R7: Persistent State & Service Restart Recovery
> **Requirement R7:** State and history must survive a restart of the service.

#### Mechanics:
- All runner states, job states, and historical transitions are persisted to MongoDB (`Job`, `Runner`, `Event` collections).
- On server startup, `schedulerService.recoverOnStartup()` runs automatically before accepting traffic:
  1. Audits any stale or expired runner claims (`claimExpiresAt <= now`) caused by a crash or downtime.
  2. Resets orphaned runners back to `IDLE` and re-queues associated jobs.
  3. Audits and resolves expired cleanup timers.
  4. Triggers background queue dispatch.

---

## Verification & Demonstration

To demonstrate correctness under concurrent load, run the automated test suite:

```bash
cd backend
npm test
```

### What the test suite demonstrates:
1. **Concurrent Load (R5)**: Submits multiple jobs at the exact same instant against an idle runner and verifies that **at most 1 job** is claimed, leaving remaining jobs queued without race conditions.
2. **Duplicate Finish Idempotency (R6)**: Executes repeated finish requests on the same job and verifies state & timestamps remain uncorrupted.
3. **Retries on Cancelled Jobs (R6)**: Cancels a job, sends a finish request, and verifies `CANCELLED` state is preserved while the runner is freed.
4. **Service Restart Recovery (R7)**: Simulates a service crash during an active claim, runs `recoverOnStartup()`, and verifies persistent state recovery.

---

## Setup & Running Locally

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Environment Configuration
Create a `.env` file in the `backend` directory:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/job-scheduling-db
```

### 3. Seed Initial Data
```bash
npm run seed
```

### 4. Run Demonstration Test Suite
```bash
npm test
```

### 5. Start Development Server
```bash
npm run dev
```

---

## Core Entities & States

### Job States
- `QUEUED`: Submitted and waiting to be claimed by an available idle runner.
- `CLAIMED`: Assigned to an idle runner with a claim TTL.
- `RUNNING`: Acknowledged by the runner and executing.
- `CLEANUP`: Execution completed; runner performing teardown tasks.
- `COMPLETED`: Execution finished successfully.
- `FAILED`: Execution finished with an error.
- `CANCELLED`: Cancelled before or during execution.

### Runner States
- `OFFLINE`: Disconnected or unreachable.
- `IDLE`: Online, healthy, and ready to accept a job.
- `CLAIMED`: Reserved for a queued job.
- `RUNNING`: Actively processing a job.
- `CLEANUP`: Performing post-job cleanup before returning to `IDLE`.
- `DRAINING`: Completing current work but accepting no new jobs.

---

## API Endpoints Reference

Base URL: `http://localhost:5000`

### Health Check

#### `GET /api/health`
Checks backend server status.

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
Submit a new job. Automatically triggers queue dispatching.

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
