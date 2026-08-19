const express = require("express");
const cors = require("cors");

const app = express();

const runnerRoutes = require("./routes/Runner");
const jobRoutes = require("./routes/Job");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/runners", runnerRoutes);
app.use("/api/jobs", jobRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend is running",
  });
});

module.exports = app;