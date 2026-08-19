const mongoose = require("mongoose");
const Runner = require("../models/Runner");
const Event = require("../models/Event");
const RUNNER_STATES = require("../constants/runnerStates");
const schedulerService = require("./schedulerService");

class RunnerService {
  async getAllRunners(queryFilters = {}) {
    const filter = {};
    if (queryFilters.state) {
      filter.state = queryFilters.state;
    }
    return await Runner.find(filter).sort({ createdAt: -1 });
  }

  async setRunnerOnline(id) {
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { runnerId: id }] }
      : { runnerId: id };

    const runner = await Runner.findOne(filter);
    if (!runner) {
      const error = new Error("Runner not found");
      error.statusCode = 404;
      throw error;
    }

    const now = new Date();
    runner.state = RUNNER_STATES.IDLE;
    runner.currentJobId = null;
    runner.connectedAt = now;
    runner.lastHeartbeatAt = now;
    await runner.save();

    await Event.create({
      entityType: "RUNNER",
      entityId: runner.runnerId,
      eventType: "RUNNER_ONLINE",
      toState: RUNNER_STATES.IDLE,
      runnerId: runner.runnerId,
      timestamp: now,
    });

    // Trigger queue processing as a runner is now IDLE
    setImmediate(() => {
      schedulerService.processQueue().catch((err) => {
        console.error("Error processing queue after runner online:", err);
      });
    });

    return runner;
  }

  async setRunnerDrain(id) {
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { runnerId: id }] }
      : { runnerId: id };

    const runner = await Runner.findOne(filter);
    if (!runner) {
      const error = new Error("Runner not found");
      error.statusCode = 404;
      throw error;
    }

    runner.state = RUNNER_STATES.DRAINING;
    await runner.save();

    return runner;
  }

  async setRunnerCleanup(id, durationMs = process.env.CLEANUP_INTERVAL_MS || 30000) {
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { runnerId: id }] }
      : { runnerId: id };

    const runner = await Runner.findOne(filter);
    if (!runner) {
      const error = new Error("Runner not found");
      error.statusCode = 404;
      throw error;
    }

    const cleanupDuration = Number(durationMs) || 30000;
    runner.state = RUNNER_STATES.CLEANUP;
    runner.cleanupUntil = new Date(Date.now() + cleanupDuration);
    await runner.save();

    return runner;
  }

  async releaseRunner(id) {
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { runnerId: id }] }
      : { runnerId: id };

    const runner = await Runner.findOne(filter);
    if (!runner) return null;

    runner.state = RUNNER_STATES.IDLE;
    runner.currentJobId = null;
    runner.claimExpiresAt = null;
    runner.cleanupUntil = null;
    runner.lastHeartbeatAt = new Date();
    await runner.save();

    setImmediate(() => {
      schedulerService.processQueue().catch((err) => {
        console.error("Error processing queue after releasing runner:", err);
      });
    });

    return runner;
  }
}

module.exports = new RunnerService();
