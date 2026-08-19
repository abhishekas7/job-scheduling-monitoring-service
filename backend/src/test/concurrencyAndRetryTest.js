const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const connectDB = require("../config/db");
const Job = require("../models/Job");
const Runner = require("../models/Runner");
const Event = require("../models/Event");
const schedulerService = require("../services/schedulerService");
const jobService = require("../services/jobService");
const runnerService = require("../services/runnerService");
const RUNNER_STATES = require("../constants/runnerStates");

async function runTests() {
  console.log("=== Starting Concurrency, Idempotency & Persistence Verification ===");
  await connectDB();

  // Clear all collections for clean isolated test environment
  await Job.deleteMany({});
  await Runner.deleteMany({});
  await Event.deleteMany({});

  try {
    // -------------------------------------------------------------
    // Test 1: Single job assignment concurrency safeguard
    // -------------------------------------------------------------
    console.log("\n[Test 1] Testing single runner concurrency safeguard...");
    
    // Create 1 idle runner
    const runner1 = await Runner.create({
      runnerId: "test-runner-1",
      name: "Test Runner 1",
      state: RUNNER_STATES.IDLE,
      connectedAt: new Date(),
      lastHeartbeatAt: new Date(),
    });

    // Submit 5 jobs simultaneously
    const submitPromises = Array.from({ length: 5 }).map((_, i) =>
      jobService.createJob({ jobId: `test-job-sim-${i}`, payload: { item: i } })
    );
    await Promise.all(submitPromises);

    // Run queue processing
    await schedulerService.processQueue();

    // Verify runner1 has at most 1 assigned job
    const updatedRunner1 = await Runner.findOne({ runnerId: "test-runner-1" });
    const claimedJobs = await Job.find({ runnerId: "test-runner-1", state: "CLAIMED" });

    console.log(`Runner state: ${updatedRunner1.state}, currentJobId: ${updatedRunner1.currentJobId}`);
    console.log(`Claimed jobs count for runner 1: ${claimedJobs.length}`);

    if (claimedJobs.length > 1) {
      throw new Error(`FAILURE: Runner was given ${claimedJobs.length} jobs simultaneously!`);
    }
    if (claimedJobs.length !== 1 || updatedRunner1.currentJobId !== claimedJobs[0].jobId) {
      throw new Error(`FAILURE: Exactly 1 job should be claimed by runner 1`);
    }
    console.log("✓ Test 1 PASSED: A runner was never given two jobs at once.");

    // -------------------------------------------------------------
    // Test 2: Idempotent Retries (reporting finish twice)
    // -------------------------------------------------------------
    console.log("\n[Test 2] Testing duplicate finish call idempotency...");
    const assignedJobId = claimedJobs[0].jobId;

    // Report finished first time
    const res1 = await jobService.finishJob(assignedJobId, { status: "COMPLETED" });
    const finishedAt1 = res1.finishedAt;

    // Report finished second time (retry)
    const res2 = await jobService.finishJob(assignedJobId, { status: "COMPLETED" });
    const finishedAt2 = res2.finishedAt;

    if (res1.state !== "COMPLETED" || res2.state !== "COMPLETED") {
      throw new Error("FAILURE: Job did not reach COMPLETED state");
    }
    if (finishedAt1.getTime() !== finishedAt2.getTime()) {
      throw new Error("FAILURE: Finished timestamp mutated on duplicate finish call!");
    }
    console.log("✓ Test 2 PASSED: Duplicate finish calls handled idempotently without corrupting state.");

    // -------------------------------------------------------------
    // Test 3: Finish / Ack received after job cancelled
    // -------------------------------------------------------------
    console.log("\n[Test 3] Testing retries on CANCELLED jobs...");
    const cancelJobObj = await jobService.createJob({ jobId: "test-job-cancelled" });
    
    // Cancel the job
    await jobService.cancelJob("test-job-cancelled");
    const cancelledJob = await Job.findOne({ jobId: "test-job-cancelled" });
    if (cancelledJob.state !== "CANCELLED") {
      throw new Error("FAILURE: Job was not cancelled");
    }

    // Try reporting finished after already cancelled
    const retriedFinish = await jobService.finishJob("test-job-cancelled", { status: "COMPLETED" });
    if (retriedFinish.state !== "CANCELLED") {
      throw new Error("FAILURE: Cancelled job state was overwritten by retried finish!");
    }

    console.log("✓ Test 3 PASSED: Retried requests on cancelled jobs handled cleanly without corrupting state.");

    // -------------------------------------------------------------
    // Test 4: R7 Startup Persistence & Recovery
    // -------------------------------------------------------------
    console.log("\n[Test 4] Testing R7 state survival across service restart...");
    const staleTime = new Date(Date.now() - 60000); // 1 minute ago

    const crashRunner = await Runner.create({
      runnerId: "test-runner-crash",
      name: "Crash Runner",
      state: RUNNER_STATES.CLAIMED,
      currentJobId: "test-job-crash",
      claimExpiresAt: staleTime,
    });

    const crashJob = await Job.create({
      jobId: "test-job-crash",
      state: "CLAIMED",
      runnerId: "test-runner-crash",
      claimedAt: staleTime,
    });

    // Execute startup recovery routine
    await schedulerService.recoverOnStartup();

    const recoveredRunner = await Runner.findOne({ runnerId: "test-runner-crash" });
    const recoveredJob = await Job.findOne({ jobId: "test-job-crash" });

    console.log(`Recovered runner state: ${recoveredRunner.state}, claimExpiresAt: ${recoveredRunner.claimExpiresAt}`);
    console.log(`Recovered job state: ${recoveredJob.state}`);

    // Verify recovery renewed claim expiration into the future
    if (recoveredRunner.claimExpiresAt.getTime() <= Date.now()) {
      throw new Error("FAILURE: Startup recovery did not clear/renew stale claim!");
    }
    const recoveryEvent = await Event.findOne({ eventType: "RECOVERY_CLAIM_EXPIRED" });
    if (!recoveryEvent) {
      throw new Error("FAILURE: Startup recovery audit event was not created!");
    }

    console.log("✓ Test 4 PASSED: Startup recovery routine restored persistent state across restart.");

    console.log("\n=== ALL CONCURRENCY, IDEMPOTENCY & PERSISTENCE TESTS PASSED SUCCESSFULLY! ===");
  } finally {
    // Clean test data
    await Job.deleteMany({});
    await Runner.deleteMany({});
    await Event.deleteMany({});
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
