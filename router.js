const express = require('express');
const bodyParser = require('body-parser');
const controller = require('./controller');
const auth = require('./auth');

const app = express();

// Set up Pug render engine (for displaying error details and reports)
app.set('views', './views');
app.set('view engine', 'pug');

// Log all request method/paths
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Certain paths need to be authenticated
app.use('/v1/scans/start', async (req, res, next) => {
  if (!req.header('authorization')) {
    res.sendStatus(401);
    return;
  }

  try {
    const isAuthenticated = await auth.isAuthenticated(req.header('authorization'));
    if (!isAuthenticated) {
      res.sendStatus(401);
      return;
    }
  } catch (err) {
    res.status(500).send(err.message);
    return;
  }

  next();
});

app.use(bodyParser.json());

// Endpoint for Akkeris "released" events
app.post('/v1/hook/released', controller.handleReleasedHook);

// Endpoint to kick off a new scan
app.post('/v1/scans/start', controller.handleNewScan);

// Endpoint for retrieval of profiles
app.get('/v1/profiles/:profileID', controller.getProfile);

// Endpoint for retrieval of reports stored in S3
app.get('/v1/reports/:profileID', controller.getReport);

// Endpoint for retrieval of running scans
app.get('/v1/scans', controller.getScans);

// Endpoint to give the user more detailed information on errors
app.get('/errors/:errorID', controller.renderError);

// Endpoint to give the user more detailed information on a finished scan
app.get('/reports/:profileID', controller.renderDetails);

// Endpoint to give the user more detailed information on currently running scans
app.get('/', controller.renderCurrentScans);
app.get('/all', controller.renderAllScans);

app.use(express.static('public'));

module.exports = app;
