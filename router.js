const express = require('express');
const bodyParser = require('body-parser');
const controller = require('./controller');

const app = express();

// Set up Pug render engine (for displaying error details and reports)
app.set('views', './views');
app.set('view engine', 'pug');

// Log all request method/paths
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.use(bodyParser.json());

// Endpoint for Akkeris "released" events
app.post('/v1/hook/released', controller.setupDetectifyScan);

// Endpoint for retrieval of profiles
app.get('/v1/profiles/:profileID', controller.getProfile);

// Endpoint for retrieval of reports stored in S3
app.get('/v1/reports/:profileID', controller.getReport);

// Endpoint to give the user more detailed information on errors
app.get('/errors/:errorID', controller.renderError);

app.get('/reports/:profileID', controller.renderDetails);

app.get('/', controller.renderScans);

app.use(express.static('public'));

module.exports = app;
