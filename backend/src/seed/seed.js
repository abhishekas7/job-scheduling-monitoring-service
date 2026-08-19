const mongoose = require("mongoose");
require("dotenv").config();

const Runner = require("../models/Runner");
const Job = require("../models/Job");
const Event = require("../models/Event");

const runners = [
  {
    runnerId: "runner-a",
    name: "Runner A",
    state: "IDLE",
    currentJobId: null,
    claimExpiresAt: null,
    cleanupUntil: null,
    lastHeartbeatAt: new Date(),
  },
  {
    runnerId: "runner-b",
    name: "Runner B",
    state: "RUNNING",
    currentJobId: "job-002",
    claimExpiresAt: null,
    cleanupUntil: null,
    lastHeartbeatAt: new Date(),
  },
  {
    runnerId: "runner-c",
    name: "Runner C",
    state: "CLAIMED",
    currentJobId: "job-003",
    claimExpiresAt: new Date(Date.now() + 5000),
    cleanupUntil: null,
    lastHeartbeatAt: new Date(),
  },
  {
    runnerId: "runner-d",
    name: "Runner D",
    state: "CLEANUP",
    currentJobId: "job-004",
    claimExpiresAt: null,
    cleanupUntil: new Date(Date.now() + 30000),
    lastHeartbeatAt: new Date(),
  },
  {
    runnerId: "runner-e",
    name: "Runner E",
    state: "DRAINING",
    currentJobId: null,
    claimExpiresAt: null,
    cleanupUntil: null,
    lastHeartbeatAt: new Date(),
  },
  {
    runnerId: "runner-f",
    name: "Runner F",
    state: "OFFLINE",
    currentJobId: null,
    claimExpiresAt: null,
    cleanupUntil: null,
    lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000),
  },
];

const jobs = [
  {
    jobId: "job-001",
    state: "QUEUED",
    runnerId: null,
    submittedAt: new Date(Date.now() - 60 * 1000),
    claimedAt: null,
    startedAt: null,
    finishedAt: null,
  },
  {
    jobId: "job-002",
    state: "RUNNING",
    runnerId: "runner-b",
    submittedAt: new Date(Date.now() - 10 * 60 * 1000),
    claimedAt: new Date(Date.now() - 9 * 60 * 1000),
    startedAt: new Date(Date.now() - 8 * 60 * 1000),
    finishedAt: null,
  },
  {
    jobId: "job-003",
    state: "CLAIMED",
    runnerId: "runner-c",
    submittedAt: new Date(Date.now() - 30 * 1000),
    claimedAt: new Date(Date.now() - 5 * 1000),
    startedAt: null,
    finishedAt: null,
  },
  {
    jobId: "job-004",
    state: "CLEANUP",
    runnerId: "runner-d",
    submittedAt: new Date(Date.now() - 5 * 60 * 1000),
    claimedAt: new Date(Date.now() - 4 * 60 * 1000),
    startedAt: new Date(Date.now() - 3 * 60 * 1000),
    finishedAt: new Date(Date.now() - 30 * 1000),
  },
  {
    jobId: "job-005",
    state: "COMPLETED",
    runnerId: "runner-a",
    submittedAt: new Date(Date.now() - 30 * 60 * 1000),
    claimedAt: new Date(Date.now() - 29 * 60 * 1000),
    startedAt: new Date(Date.now() - 28 * 60 * 1000),
    finishedAt: new Date(Date.now() - 20 * 60 * 1000),
  },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");

    await Runner.deleteMany({});
    await Job.deleteMany({});
    await Event.deleteMany({});

    const insertedRunners = await Runner.insertMany(runners);
    const insertedJobs = await Job.insertMany(jobs);

    const events = [
      {
        entityType: "RUNNER",
        entityId: "runner-a",
        eventType: "STATE_CHANGED",
        fromState: "OFFLINE",
        toState: "IDLE",
        jobId: null,
        timestamp: new Date(Date.now() - 60 * 60 * 1000),
        metadata: {},
      },
      {
        entityType: "JOB",
        entityId: "job-001",
        eventType: "JOB_SUBMITTED",
        fromState: null,
        toState: "QUEUED",
        jobId: "job-001",
        timestamp: new Date(Date.now() - 60 * 1000),
        metadata: {},
      },
      {
        entityType: "RUNNER",
        entityId: "runner-b",
        eventType: "STATE_CHANGED",
        fromState: "CLAIMED",
        toState: "RUNNING",
        jobId: "job-002",
        timestamp: new Date(Date.now() - 8 * 60 * 1000),
        metadata: {},
      },
      {
        entityType: "RUNNER",
        entityId: "runner-d",
        eventType: "STATE_CHANGED",
        fromState: "RUNNING",
        toState: "CLEANUP",
        jobId: "job-004",
        timestamp: new Date(Date.now() - 30 * 1000),
        metadata: {},
      },
    ];

    await Event.insertMany(events);

    console.log(`Inserted ${insertedRunners.length} runners`);
    console.log(`Inserted ${insertedJobs.length} jobs`);
    console.log(`Inserted ${events.length} events`);

    console.log("Database seeded successfully");

    await mongoose.disconnect();
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
};

seed();