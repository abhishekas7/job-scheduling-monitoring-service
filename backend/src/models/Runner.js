const mongoose = require("mongoose");
const RUNNER_STATES = require("../constants/runnerStates");

const runnerSchema = new mongoose.Schema(
  {
    runnerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      enum: Object.values(RUNNER_STATES),
      required: true,
      default: RUNNER_STATES.OFFLINE,
      index: true,
    },

    currentJobId: {
      type: String,
      default: null,
      index: true,
    },

    claimExpiresAt: {
      type: Date,
      default: null,
    },

    cleanupUntil: {
      type: Date,
      default: null,
    },

    connectedAt: {
      type: Date,
      default: null,
    },

    lastHeartbeatAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Runner", runnerSchema);