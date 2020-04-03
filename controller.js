const assert = require('assert');
const { URL } = require('url');
const uuid = require('uuid/v4');
const akkeris = require('./api/akkeris');
const detectify = require('./api/detectify');
const s3 = require('./api/s3');
const db = require('./db');

const isUUID = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

function sendJSONResponse(res, statusCode, message) {
  res.type('application/json');
  res.status(statusCode).send(JSON.stringify({ message }));
}

async function reportErrorToAkkeris(payload, releaseStatusID, scanProfileID, errMsg, errType) {
  console.log(errMsg);
  try {
    const errorUUID = uuid();
    await db.storeError(errorUUID, errMsg, scanProfileID, payload.release.id);
    await db.updateScanProfileStatus(scanProfileID, 'error');
    await akkeris.updateReleaseStatusWithError(payload.key, payload.release.id, releaseStatusID, errorUUID, errType);
  } catch (error) {
    console.log(`Unable to report error to Akkeris: ${error.message}`);
  }
}

async function setupDetectifyScan(url, appName) {
  // Get a full list of domains from Detectify
  let domains;
  let scanProfile;
  try {
    ({ data: domains } = await detectify.getDomains());
  } catch (err) {
    const errMsg = `Error getting list of domains from Detectify${err.response.data ? `: ${JSON.stringify(err.response.data)}` : ''}`;
    throw new Error(errMsg);
  }

  // Find the domain associated with the app URL
  const appURL = new URL(url);
  const dIndex = domains.findIndex((d) => appURL.hostname.endsWith(d.name));
  if (dIndex === -1) {
    const errMsg = `${appName} URL (${url}) base domain could not be found in the list of domains associated with the given Detectify API key`;
    throw new Error(errMsg);
  }

  // Create the Detectify scan profile
  try {
    ({ data: scanProfile } = await detectify.createScanProfile(domains[dIndex].token, appURL.hostname));
  } catch (err) {
    const errMsg = `Error - Could not create Detectify scan profile${err.response.data ? `: ${JSON.stringify(err.response.data)}` : ''}`;
    throw new Error(errMsg);
  }

  return scanProfile;
}

async function startDetectifyScan(scanProfile) {
  let scanStatus;

  // Start scan on the scan profile
  try {
    await detectify.startScan(scanProfile.token);
  } catch (err) {
    const errMsg = `Error - Could not start Detectify scan on scan profile${err.response.data ? `: ${JSON.stringify(err.response.data)}` : ''}`;
    throw new Error(errMsg);
  }

  // Get status of scan
  try {
    ({ data: scanStatus } = await detectify.getScanStatus(scanProfile.token));
  } catch (err) {
    const errMsg = `Error - Could not get Detectify scan status on scan profile${err.response.data ? `: ${JSON.stringify(err.response.data)}` : ''}`;
    throw new Error(errMsg);
  }

  return scanStatus;
}

async function handleReleasedHook(req, res) {
  const payload = req.body;
  try {
    assert.ok((
      !!payload.key
      && payload.action === 'released'
      && payload.release
      && payload.release.id
      && !!req.header('x-akkeris-token')
      && req.header('user-agent') === 'akkeris-hookshot'
    ), 'Payload did not match expected format');
  } catch (err) {
    res.status(422).send(err.message);
    return;
  }
  res.sendStatus(200);

  let app;
  let releaseStatusID;
  let scanProfile;
  let scanStatus;

  const { key: appName, release: { id: releaseID } } = payload;

  // Fetch app details from Akkeris so we can scan the URL with Detectify
  try {
    ({ data: app } = await akkeris.getAppDetails(appName));
  } catch (err) {
    console.log(`Error getting app details from Akkeris: ${err.message}`);
    return;
  }

  // Create an initial release status that we will update with further info
  try {
    ({ data: { id: releaseStatusID } } = await akkeris.createReleaseStatus(appName, releaseID, 'pending', 'Detectify scan pending creation'));
  } catch (err) {
    console.log(`Error creating Akkeris release status: ${err.message}`);
    return;
  }

  // Store release details in the database for later use
  await db.storeRelease(releaseID, appName, releaseStatusID, payload);

  try {
    scanProfile = await setupDetectifyScan(app.web_url, appName);
  } catch (err) {
    reportErrorToAkkeris(payload, releaseStatusID, '', err.message, 'Detectify Service Error');
    return;
  }

  // Store scan profile in database
  const scanProfileID = uuid();
  scanProfile.akkeris_app = appName;
  await db.storeScanProfile(scanProfileID, scanProfile, 'profile_created', releaseID);

  try {
    scanStatus = await startDetectifyScan(scanProfile);
  } catch (err) {
    reportErrorToAkkeris(payload, releaseStatusID, scanProfileID, err.message, 'Detectify Service Error');
    return;
  }

  // Update the release status with the state of the new test
  try {
    await akkeris.updateReleaseStatus(appName, releaseID, releaseStatusID, 'pending', `Detectify scan ${scanStatus.state}`);
  } catch (err) {
    console.log(`Error updating Akkeris release status: ${err.message}`);
  }

  // Store scan profile status in database
  await db.updateScanProfileStatus(scanProfileID, scanStatus.state);

  console.log(`Detectify scan profile "${scanProfile.name}" created for "${appName}" and scan started with status: "${scanStatus.state}"`);
}

async function handleNewScan(req, res) {
  const payload = req.body;
  try {
    assert.ok(!!payload.app_name, 'Payload did not match expected format');
  } catch (err) {
    sendJSONResponse(res, 422, err.message);
    return;
  }

  const { app_name: appName, success_threshold: successThreshold } = payload;

  let app;
  let scanProfile;
  let scanStatus;

  // Fetch app details from Akkeris so we can scan the URL with Detectify
  try {
    ({ data: app } = await akkeris.getAppDetails(appName));
  } catch (err) {
    const errorMessage = `Error getting app details from Akkeris: ${err.message}`;
    console.log(errorMessage);
    sendJSONResponse(res, 500, errorMessage);
    return;
  }

  try {
    scanProfile = await setupDetectifyScan(app.web_url, appName);
  } catch (err) {
    const errorMessage = `Error creating scan profile: ${err.message}`;
    console.log(errorMessage);
    sendJSONResponse(res, 500, errorMessage);
    return;
  }

  // Store scan profile in database
  const scanProfileID = uuid();
  scanProfile.akkeris_app = appName;
  await db.storeScanProfile(scanProfileID, scanProfile, 'profile_created', undefined, successThreshold);

  try {
    scanStatus = await startDetectifyScan(scanProfile);
  } catch (err) {
    const errorMessage = `Error starting Detectify scan: ${err.message}`;
    sendJSONResponse(res, 500, errorMessage);
    console.log(errorMessage);
    return;
  }

  // Store scan profile status in database
  await db.updateScanProfileStatus(scanProfileID, scanStatus.state);

  const result = `Detectify scan profile "${scanProfile.name}" created for "${appName}" and scan started with status: "${scanStatus.state}"`;
  console.log(result);
  sendJSONResponse(res, 200, result);
}

/**
 * Retrieve error details from DB and display it as HTML
 */
async function renderError(req, res) {
  let error;

  if (!req.params.errorID || !isUUID.test(req.params.errorID)) {
    res.render('errorDetails', { title: 'Detectify Error Details', errorDescription: 'Invalid errorID!' });
    return;
  }

  try {
    error = await db.getError(req.params.errorID);
  } catch (err) {
    res.render('errorDetails', { title: 'Detectify Error Details', errorDescription: 'Requested error details not found' });
    return;
  }

  res.render('errorDetails', {
    title: 'Detectify Error Details',
    errorDescription: error.description,
    createdAt: error.scan_profile_created_at,
    appName: error.akkeris_app,
    releaseID: error.release,
    scanStatus: error.scan_status,
    appURL: `${process.env.AKKERIS_UI}/apps/${error.akkeris_app}`,
    releaseURL: `${process.env.AKKERIS_UI}/apps/${error.akkeris_app}/releases`,
  });
}

/**
 * Retrieve given scan profile
 */
async function getProfile(req, res) {
  if (!req.params.profileID) {
    res.sendStatus(404);
    return;
  }

  let scanProfile;
  try {
    scanProfile = await db.getScanProfile(req.params.profileID);
  } catch (err) {
    res.sendStatus(404);
    return;
  }

  res.status(200).send(scanProfile);
}

/**
 * Retrieve report for a given scan profile
 */
async function getReport(req, res) {
  if (!req.params.profileID) {
    res.sendStatus(404);
    return;
  }

  let scanProfile;
  try {
    scanProfile = await db.getScanProfile(req.params.profileID);
  } catch (err) {
    res.sendStatus(404);
    return;
  }

  if (scanProfile && scanProfile.report_filename && scanProfile.report_filename !== '') {
    try {
      res.status(200).send(JSON.parse((await s3.getObject(scanProfile.report_filename)).Body));
    } catch (err) {
      console.log(err.message);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(400);
  }
}

async function renderDetails(req, res) {
  if (!req.params.profileID) {
    res.sendStatus(404);
    return;
  }

  let profile;
  try {
    profile = await db.getScanProfile(req.params.profileID);
  } catch (err) {
    res.sendStatus(404);
    return;
  }

  let favicon;
  switch (profile.scan_status) {
    case 'success':
      favicon = '/success_lg.png';
      break;
    case 'running':
      favicon = '/pending_lg.png';
      break;
    case 'starting':
      favicon = '/pending_lg.png';
      break;
    default:
      favicon = '/failure_lg.png';
  }

  res.render('reportDetails', {
    title: 'Detectify Scan Report',
    profileID: req.params.profileID,
    profileName: profile.name,
    endpoint: profile.endpoint,
    appName: profile.akkeris_app,
    appURL: `${process.env.AKKERIS_UI}/apps/${profile.akkeris_app}`,
    releaseURL: `${process.env.AKKERIS_UI}/apps/${profile.akkeris_app}/releases`,
    releaseID: profile.release,
    reportFilename: profile.report_filename,
    createdAt: profile.created_at,
    favicon,
    scanStatus: profile.scan_status,
    successThreshold: profile.success_threshold,
  });
}

async function renderCurrentScans(req, res) {
  let pendingScans;
  try {
    pendingScans = await db.getRunningScans();
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
    return;
  }

  pendingScans.sort((a, b) => b.created_at - a.created_at);

  res.render('scanList', {
    listType: 'running',
    scans: pendingScans,
    uiEndpoint: process.env.AKKERIS_UI,
  });
}

async function renderAllScans(req, res) {
  let scans;
  try {
    scans = await db.getAllScans();
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
    return;
  }

  scans.sort((a, b) => b.created_at - a.created_at);

  res.render('scanList', {
    listType: 'all',
    scans,
    uiEndpoint: process.env.AKKERIS_UI,
  });
}

// Return list of currently running scans
async function getScans(req, res) {
  let pendingScans;
  try {
    pendingScans = await db.getRunningScans();
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
    return;
  }
  pendingScans.sort((a, b) => b.created_at - a.created_at);
  res.status(200).send(pendingScans);
}

module.exports = {
  getProfile,
  getReport,
  renderError,
  renderDetails,
  renderCurrentScans,
  renderAllScans,
  getScans,
  handleReleasedHook,
  handleNewScan,
};
