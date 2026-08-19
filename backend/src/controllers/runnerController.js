const runnerService = require("../services/runnerService");

class RunnerController {
  async getRunners(req, res) {
    try {
      const runners = await runnerService.getAllRunners(req.query);
      return res.status(200).json({
        success: true,
        message: "Runners fetched successfully",
        data: runners,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch runners",
        error: error.message,
      });
    }
  }
  async bringOnline(req, res) {
    try {
      const runner = await runnerService.setRunnerOnline(req.params.id);
      return res.status(200).json({
        success: true,
        message: "Runner brought online successfully",
        data: runner,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to bring runner online",
      });
    }
  }

  async drainRunner(req, res) {
    try {
      const runner = await runnerService.setRunnerDrain(req.params.id);
      return res.status(200).json({
        success: true,
        message: "Runner set to draining mode successfully",
        data: runner,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to set runner to draining mode",
      });
    }
  }
}

module.exports = new RunnerController();
