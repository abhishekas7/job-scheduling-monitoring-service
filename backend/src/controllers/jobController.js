const jobService = require("../services/jobService");

class JobController {
  async getJobs(req, res) {
    try {
      const jobs = await jobService.getAllJobs(req.query);
      return res.status(200).json({
        success: true,
        message: "Jobs fetched successfully",
        data: jobs,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch jobs",
        error: error.message,
      });
    }
  }

  async createJob(req, res) {
    try {
      const newJob = await jobService.createJob(req.body);
      return res.status(201).json({
        success: true,
        message: "Job submitted successfully",
        data: newJob,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to create job",
        error: error.message,
      });
    }
  }

  async ackJob(req, res) {
    try {
      const job = await jobService.ackJob(req.params.id);
      return res.status(200).json({
        success: true,
        message: "Job acknowledged",
        data: job,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to acknowledge job",
      });
    }
  }

  async finishJob(req, res) {
    try {
      const job = await jobService.finishJob(req.params.id, req.body);
      return res.status(200).json({
        success: true,
        message: "Job status updated",
        data: job,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to finish job",
      });
    }
  }

  async cancelJob(req, res) {
    try {
      const job = await jobService.cancelJob(req.params.id);
      return res.status(200).json({
        success: true,
        message: "Job cancelled",
        data: job,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to cancel job",
      });
    }
  }
}

module.exports = new JobController();
