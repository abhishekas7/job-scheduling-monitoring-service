const mongoose = require("mongoose");

const JOB_STATES = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "CLEANUP",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

const jobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    state: {
      type: String,
      enum: JOB_STATES,
      required: true,
      default: "QUEUED",
      index: true,
    },

    runnerId: {
      type: String,
      default: null,
      index: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    claimedAt: {
      type: Date,
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    finishedAt: {
      type: Date,
      default: null,
    },

    error: {
      type: String,
      default: null,
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Job", jobSchema);