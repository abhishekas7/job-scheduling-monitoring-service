const express = require("express");
const router = express.Router();
const runnerController = require("../controllers/runnerController");

router.get("/", (req, res) => runnerController.getRunners(req, res));
router.post("/:id/online", (req, res) => runnerController.bringOnline(req, res));
router.post("/:id/drain", (req, res) => runnerController.drainRunner(req, res));

module.exports = router;