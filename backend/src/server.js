require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");
const schedulerService = require("./services/schedulerService");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  await schedulerService.recoverOnStartup();
  schedulerService.startBackgroundLoop();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer();