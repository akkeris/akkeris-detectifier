const assert = require('assert');
const db = require('./db');
const s3 = require('./api/s3');
const taskHandler = require('./taskHandler');

// Check for required environment variables
const requiredEnv = ['AKKERIS_APP_CONTROLLER', 'AKKERIS_SERVICE_TOKEN', 'AKKERIS_UI', 'DETECTIFY_API', 'DETECTIFY_API_KEY', 'DATABASE_URL'];
const missingEnv = requiredEnv.reduce((acc, env) => {
  if (!process.env[env]) {
    acc.push(env);
  }
  return acc;
}, []);

assert.ok(missingEnv.length === 0, `Missing environment variable(s): ${missingEnv.join(', ')}`);

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
