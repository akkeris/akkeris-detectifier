const db = require('./db');
const s3 = require('./api/s3');
const taskHandler = require('./taskHandler');

// Initialize connection to the database and S3
db.init();
s3.init();

// Parse how often to process pending profiles (defaults to 5 minutes)
let intervalMinutes;
try {
  intervalMinutes = Number(process.env.WORKER_INTERVAL);
  if (isNaN(intervalMinutes)) throw new Error(); // eslint-disable-line
  console.log(`Using ${intervalMinutes} minutes as worker interval.`);
} catch (err) {
  console.log('WORKER_INTERVAL is missing or invalid.');
  console.log('Using default worker interval (5 minutes).');
  intervalMinutes = 5;
}

const interval = setInterval(taskHandler.run, intervalMinutes * 60 * 1000);

taskHandler.run();

process.on('SIGTERM', () => {
  clearInterval(interval);
  process.exit(0);
});
