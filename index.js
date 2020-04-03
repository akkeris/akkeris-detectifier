const assert = require('assert');
const db = require('./db');
const s3 = require('./api/s3');

const port = process.env.PORT || 9000;

// Check for required environment variables
const requiredEnv = ['AKKERIS_APP_CONTROLLER', 'AKKERIS_SERVICE_TOKEN', 'AKKERIS_UI', 'AUTH_HOST', 'DETECTIFY_API', 'DETECTIFY_API_KEY', 'DATABASE_URL'];
const missingEnv = requiredEnv.reduce((acc, env) => {
  if (!process.env[env]) {
    acc.push(env);
  }
  return acc;
}, []);

assert.ok(missingEnv.length === 0, `Missing environment variable(s): ${missingEnv.join(', ')}`);

// Set up database pooling
db.init();

// Set up S3 connection
s3.init();

// Set up Express routes
const router = require('./router');

router.listen(port, () => {
  console.log(`akkeris-detectify-scanner listening on port ${port}!\n`);
});
