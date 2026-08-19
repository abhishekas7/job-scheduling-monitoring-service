const Job = require("../models/Job");
const Runner = require("../models/Runner");
const Event = require("../models/Event");
const RUNNER_STATES = require("../constants/runnerStates");

class SchedulerService {
  constructor() {
    this._isProcessing = false;
  }

  /**
   * Main dispatch loop:
   * 1. Finds oldest QUEUED job (FIFO by submittedAt / createdAt).
   * 2. Finds IDLE runner with earliest lastHeartbeatAt or connectedAt (IDLE longest).
   * 3. Atomically assigns job to runner if both are available.
   * 4. Repeats until no more queued jobs or idle runners exist.
   */
  async processQueue() {
    if (this._isProcessing) return 0;
    this._isProcessing = true;
    let assignedCount = 0;

    try {
      while (true) {
        // Find oldest queued job (FIFO)
        const oldestJob = await Job.findOne({ state: "QUEUED" })
          .sort({ submittedAt: 1, createdAt: 1 });

        if (!oldestJob) break; // No queued jobs left

        // Find runner that has been IDLE longest and has no assigned job
        const longestIdleRunner = await Runner.findOne({
          state: RUNNER_STATES.IDLE,
          currentJobId: null,
        }).sort({ lastHeartbeatAt: 1, connectedAt: 1, _id: 1 });

        if (!longestIdleRunner) break; // No free/IDLE runners available

        // Atomically claim the runner to prevent race conditions
        const updatedRunner = await Runner.findOneAndUpdate(
          {
            _id: longestIdleRunner._id,
            state: RUNNER_STATES.IDLE,
            currentJobId: null,
          },
          {
            $set: {
              state: RUNNER_STATES.CLAIMED,
              currentJobId: oldestJob.jobId,
              claimExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min TTL default
            },
          },
          { returnDocument: "after" }
        );

        if (!updatedRunner) {
          // Runner was claimed concurrently by another process/thread, retry
          continue;
        }

        // Atomically claim the job
        const updatedJob = await Job.findOneAndUpdate(
          { _id: oldestJob._id, state: "QUEUED" },
          {
            $set: {
              state: "CLAIMED",
              runnerId: updatedRunner.runnerId,
              claimedAt: new Date(),
            },
          },
          { returnDocument: "after" }
        );

        if (!updatedJob) {
          // Job was claimed concurrently or state changed, roll back runner state
          await Runner.updateOne(
            { _id: updatedRunner._id },
            {
              $set: {
                state: RUNNER_STATES.IDLE,
                currentJobId: null,
                claimExpiresAt: null,
              },
            }
          );
          continue;
        }

        // Log audit event for assignment
        await Event.create({
          entityType: "JOB",
          entityId: updatedJob.jobId,
          eventType: "JOB_CLAIMED",
          fromState: "QUEUED",
          toState: "CLAIMED",
          jobId: updatedJob.jobId,
          runnerId: updatedRunner.runnerId,
          timestamp: new Date(),
          metadata: { assignedBy: "scheduler" },
        });

        assignedCount++;
      }
    } finally {
      this._isProcessing = false;
    }

    return assignedCount;
  }

  async checkExpiredCleanups() {
    const expiredRunners = await Runner.find({
      state: RUNNER_STATES.CLEANUP,
      cleanupUntil: { $lte: new Date() },
    });

    if (expiredRunners.length === 0) return 0;

    let updatedCount = 0;
    for (const runner of expiredRunners) {
      const res = await Runner.updateOne(
        { _id: runner._id, state: RUNNER_STATES.CLEANUP },
        {
          $set: {
            state: RUNNER_STATES.IDLE,
            currentJobId: null,
            cleanupUntil: null,
            lastHeartbeatAt: new Date(),
          },
        }
      );
      if (res.modifiedCount > 0) {
        updatedCount++;
        await Event.create({
          entityType: "RUNNER",
          entityId: runner.runnerId,
          eventType: "CLEANUP_EXPIRED",
          fromState: RUNNER_STATES.CLEANUP,
          toState: RUNNER_STATES.IDLE,
          runnerId: runner.runnerId,
          timestamp: new Date(),
        });
      }
    }

    if (updatedCount > 0) {
      await this.processQueue();
    }

    return updatedCount;
  }

  /**
   * Requirement R7: Startup Recovery
   * On service restart, audit stale claims or expired cleanups to restore clean persistent state.
   */
  async recoverOnStartup() {
    const now = new Date();

    // 1. Recover expired runner claims
    const expiredClaimRunners = await Runner.find({
      state: RUNNER_STATES.CLAIMED,
      claimExpiresAt: { $lte: now },
    });

    for (const runner of expiredClaimRunners) {
      // Revert runner
      await Runner.updateOne(
        { _id: runner._id },
        {
          $set: {
            state: RUNNER_STATES.IDLE,
            currentJobId: null,
            claimExpiresAt: null,
          },
        }
      );

      // Revert corresponding claimed job back to QUEUED if still claimed
      if (runner.currentJobId) {
        await Job.updateOne(
          { jobId: runner.currentJobId, state: "CLAIMED" },
          {
            $set: {
              state: "QUEUED",
              runnerId: null,
              claimedAt: null,
            },
          }
        );
      }

      await Event.create({
        entityType: "RUNNER",
        entityId: runner.runnerId,
        eventType: "RECOVERY_CLAIM_EXPIRED",
        fromState: RUNNER_STATES.CLAIMED,
        toState: RUNNER_STATES.IDLE,
        runnerId: runner.runnerId,
        jobId: runner.currentJobId,
        timestamp: now,
      });
    }

    // 2. Clear expired cleanups
    await this.checkExpiredCleanups();

    // 3. Trigger queue processing to dispatch any QUEUED jobs
    await this.processQueue();
  }

  startBackgroundLoop(intervalMs = 5000) {
    if (this._timer) return;
    this._timer = setInterval(async () => {
      try {
        await this.checkExpiredCleanups();
        await this.processQueue();
      } catch (err) {
        console.error("Scheduler loop error:", err.message);
      }
    }, intervalMs);
  }
}

module.exports = new SchedulerService();
