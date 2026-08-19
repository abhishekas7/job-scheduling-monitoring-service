# job-scheduling-monitoring-service

Node.js job scheduling service with three states for jobs and four states for runners:

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Seed the database:
   ```bash
   npm run seed
   ```
3. Start the server:
   ```bash
   npm run dev
   ```

## Job states

- QUEUED
- CLAIMED
- RUNNING
- CLEANUP
- COMPLETED
- FAILED

## Runner states

- OFFLINE
- IDLE
- CLAIMED
- RUNNING
- CLEANUP
- DRAINING
