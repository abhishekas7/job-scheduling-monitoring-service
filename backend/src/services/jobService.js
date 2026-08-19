const Job = require("../models/Job");
const Event = require("../models/Event");
const schedulerService = require("./schedulerService");
const runnerService = require("./runnerService");

class JobService {
  //fetch all jobs
  async getAllJobs(queryFilters = {}) {
    const filter = {};
    if (queryFilters.state) {
      filter.state = queryFilters.state;
    }
    if (queryFilters.runnerId) {
      filter.runnerId = queryFilters.runnerId;
    }
    return await Job.find(filter).sort({ createdAt: -1 });
  }
  
  async createJob(jobData) {
    const { jobId, payload } = jobData;
    const generatedJobId = jobId || `job-${Date.now()}`;

    // Handle retry on job creation if identical jobId exists
    const existingJob = await Job.findOne({ jobId: generatedJobId });
    if (existingJob) {
      return existingJob; // Idempotent submission
    }

    const newJob = new Job({
      jobId: generatedJobId,
      state: "QUEUED",
      payload: payload || {},
      submittedAt: new Date(),
    });

    const savedJob = await newJob.save();

    await Event.create({
      entityType: "JOB",
      entityId: savedJob.jobId,
      eventType: "JOB_SUBMITTED",
      toState: "QUEUED",
      jobId: savedJob.jobId,
      timestamp: new Date(),
    });

    // Automatically trigger queue processing asynchronously
    setImmediate(() => {
      schedulerService.processQueue().catch((err) => {
        console.error("Error processing queue after job creation:", err);
      });
    });

    return savedJob;
  }

  /**
   * Idempotent finish handling:
   * - Retried finish calls return current job state without corrupting timestamps.
   * - Finish calls on CANCELLED jobs free up the runner while preserving CANCELLED state.
   */
  async finishJob(jobId, { status = "COMPLETED", error = null } = {}) {
    const job = await Job.findOne({ jobId });
    if (!job) {
      const err = new Error("Job not found");
      err.statusCode = 404;
      throw err;
    }

    // Idempotency: if already terminal state (COMPLETED / FAILED)
    if (job.state === "COMPLETED" || job.state === "FAILED") {
      return job;
    }

    // Retried completion after job was already CANCELLED
    if (job.state === "CANCELLED") {
      if (job.runnerId) {
        await runnerService.setRunnerCleanup(job.runnerId);
      }
      await Event.create({
        entityType: "JOB",
        entityId: job.jobId,
        eventType: "FINISH_RECEIVED_ON_CANCELLED_JOB",
        fromState: "CANCELLED",
        toState: "CANCELLED",
        jobId: job.jobId,
        runnerId: job.runnerId,
        timestamp: new Date(),
        metadata: { retriedStatus: status, retriedError: error },
      });
      return job;
    }

    const previousState = job.state;
    const finalState = status === "FAILED" ? "FAILED" : "COMPLETED";

    job.state = finalState;
    job.finishedAt = new Date();
    if (error) job.error = error;
    await job.save();

    if (job.runnerId) {
      await runnerService.setRunnerCleanup(job.runnerId);
    }

    await Event.create({
      entityType: "JOB",
      entityId: job.jobId,
      eventType: `JOB_${finalState}`,
      fromState: previousState,
      toState: finalState,
      jobId: job.jobId,
      runnerId: job.runnerId,
      timestamp: new Date(),
      metadata: { error },
    });

    return job;
  }

  /**
   * Idempotent cancel handling:
   * - Prevents duplicate state mutations.
   * - Releases assigned runner safely.
   */
  async cancelJob(jobId) {
    const job = await Job.findOne({ jobId });
    if (!job) {
      const err = new Error("Job not found");
      err.statusCode = 404;
      throw err;
    }

    if (job.state === "CANCELLED" || job.state === "COMPLETED" || job.state === "FAILED") {
      return job; // Idempotent
    }

    const previousState = job.state;
    job.state = "CANCELLED";
    job.finishedAt = new Date();
    await job.save();

    if (job.runnerId) {
      await runnerService.releaseRunner(job.runnerId);
    }

    await Event.create({
      entityType: "JOB",
      entityId: job.jobId,
      eventType: "JOB_CANCELLED",
      fromState: previousState,
      toState: "CANCELLED",
      jobId: job.jobId,
      runnerId: job.runnerId,
      timestamp: new Date(),
    });

    return job;
  }

  /**
   * Idempotent start/acknowledge handling
   */
  async ackJob(jobId) {
    const job = await Job.findOne({ jobId });
    if (!job) {
      const err = new Error("Job not found");
      err.statusCode = 404;
      throw err;
    }

    if (job.state === "RUNNING") {
      return job; 
    }

    if (job.state === "CANCELLED" || job.state === "COMPLETED" || job.state === "FAILED") {
      if (job.runnerId) {
        await runnerService.releaseRunner(job.runnerId);
      }
      return job;
    }

    const previousState = job.state;
    job.state = "RUNNING";
    job.startedAt = new Date();
    await job.save();

    await Event.create({
      entityType: "JOB",
      entityId: job.jobId,
      eventType: "JOB_RUNNING",
      fromState: previousState,
      toState: "RUNNING",
      jobId: job.jobId,
      runnerId: job.runnerId,
      timestamp: new Date(),
    });

    return job;
  }
}

module.exports = new JobService();
