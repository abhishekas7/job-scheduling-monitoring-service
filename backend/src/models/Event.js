const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ["RUNNER", "JOB"],
      required: true,
      index: true,
    },

    entityId: {
      type: String,
      required: true,
      index: true,
    },

    eventType: {
      type: String,
      required: true,
      index: true,
    },

    fromState: {
      type: String,
      default: null,
    },

    toState: {
      type: String,
      default: null,
    },

    jobId: {
      type: String,
      default: null,
      index: true,
    },

    runnerId: {
      type: String,
      default: null,
      index: true,
    },

    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Event", eventSchema);