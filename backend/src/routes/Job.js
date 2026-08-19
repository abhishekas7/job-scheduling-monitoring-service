const express = require("express");
const router = express.Router();
const jobController = require("../controllers/jobController");

router.get("/", (req, res) => jobController.getJobs(req, res));
router.post("/", (req, res) => jobController.createJob(req, res));
router.post("/:id/ack", (req, res) => jobController.ackJob(req, res));
router.post("/:id/finish", (req, res) => jobController.finishJob(req, res));
router.post("/:id/cancel", (req, res) => jobController.cancelJob(req, res));

module.exports = router;
