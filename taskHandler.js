const uuid = require('uuid').v4;
const akkeris = require('./api/akkeris');
const db = require('./db');
const detectify = require('./api/detectify');
const s3 = require('./api/s3');

// How many minutes a scan should run before it is considered timed out
const timeoutMinutes = Number.isInteger(Number.parseInt(process.env.TIMEOUT_MINUTES, 10))
  ? Number.parseInt(process.env.TIMEOUT_MINUTES, 10) : 50;

// Possible error statuses from Detectify
const errorStatuses = ['unable_to_resolve', 'unable_to_complete'];

const timeoutMessage = `The Detectify scan took longer than ${timeoutMinutes.toString()} minutes to complete.`;

const CALLBACK_URL = process.env.CALLBACK_URL ? (
  /^https?:\/\/.+$/.test(process.env.CALLBACK_URL) ? process.env.CALLBACK_URL : `https://${process.env.CALLBACK_URL}`
) : 'http://localhost:9000';

// Remove profile from Detectify and mark as deleted in the database
async function deleteProfile(profile) {
  try {
    await detectify.deleteScanProfile(profile.scan_profile_token);
  } catch (err) {
    console.log('ERROR: Unable to delete Detectify scan profile. Scan profile has not been removed from the database.');
    console.log(err.message);
    // If there is an error deleting from Detectify, do not remove the scan profile from the database
    return;
  }
  try {
    await db.deleteScanProfile(profile.scan_profile);
    await db.deleteRelease(profile.release);
  } catch (err) {
    console.log('ERROR: Unable to mark scan profile as deleted in the database');
    console.log(err.message);
    return;
  }
  console.log(`Scan profile ${profile.name} was deleted successfully.`);
}

// Update Akkeris release status with an error message
async function reportError(profile, errorMessage, errorType) {
  try {
    const errorID = uuid();
    await db.storeError(errorID, errorMessage, profile.release, profile.scan_profile_token);
    await akkeris.updateReleaseStatusWithError(profile.token, profile.app_name, profile.release, profile.status_id, errorID, errorType);
  } catch (err) {
    console.log(`ERROR: Unable to report "${errorType}" error to Akkeris`);
    console.log(err.message);
  }
  await deleteProfile(profile);
}

// Update profile status in the database
async function updateProfileStatus(profile, newStatus) {
  try {
    console.log(`Scan profile ${profile.name} changed status from ${profile.scan_status} to ${newStatus}`);
    await db.updateScanProfileStatus(profile.scan_profile, newStatus);
  } catch (err) {
    console.log('ERROR: Unable to update scan profile status in the database');
    console.log(err.message);
  }
}

// Get scan status and report back to Akkeris if it is done or has an error
async function processScanProfile(profile) {
  const timeSince = Date.now() - (new Date(profile.created_at));

  // Timeout
  if (timeSince > (timeoutMinutes * 60 * 1000)) {
    console.log(`Marking scan profile ${profile.name} as timeout...`);
    await reportError(profile, timeoutMessage, 'Timeout');
    await updateProfileStatus(profile, 'timeout');
    await deleteProfile(profile);
    return;
  }

  if (profile.scan_status === 'success' || profile.scan_status === 'fail' || profile.scan_status === 'error') {
    await deleteProfile(profile);
    return;
  }

  // Check scan status
  let scanStatus;
  try {
    ({ data: scanStatus } = await detectify.getScanStatus(profile.scan_profile_token));
  } catch (err) {
    console.log('ERROR: Unable to get scan profile status from Detectify');
    console.log(err.message);
    await reportError(profile, 'Unable to get scan profile status from the Detectify API', 'Detectify API Error');
    return;
  }

  if (errorStatuses.find((x) => x === scanStatus.state)) {
    console.log(`Scan profile ${profile.name} finished with error ${scanStatus.state}`);
    await reportError(profile, `Scan returned with an error: ${scanStatus.state}`, 'Scan Error');
    return;
  }

  // Scan is finished
  if (scanStatus.state === 'stopped') {
    console.log(`The running scan for profile ${profile.name} has completed!`);

    // Get details for scan
    let fullReport;
    try {
      ({ data: fullReport } = await detectify.getFullScanReport(profile.scan_profile_token));
    } catch (err) {
      console.log('ERROR: Unable to get full scan report from Detectify');
      console.log(err.message);
      await reportError(profile, 'Unable to get full scan report from Detectify', 'Detectify API Error');
      return;
    }

    const reportLink = `${CALLBACK_URL}/reports/${profile.scan_profile}`;

    // Report success/fail status to Akkeris
    try {
      // https://blog.detectify.com/2017/05/24/interpret-detectify-score/
      // 0-2.9: low     3-5.9: medium       6-10: high
      if (fullReport.cvss < 6) {
        console.log(`The running scan for profile ${profile.name} was successful!`);
        await akkeris.updateReleaseStatus(profile.token, profile.app_name, profile.release, profile.status_id, 'success', 'Detectify scan passed!', reportLink);
        await updateProfileStatus(profile, 'success');
      } else {
        console.log(`The running scan for profile ${profile.name} was unsuccessful.`);
        await akkeris.updateReleaseStatus(profile.token, profile.app_name, profile.release, profile.status_id, 'fail', 'Detectify scan failed', reportLink);
        await updateProfileStatus(profile, 'fail');
      }
    } catch (err) {
      console.log('ERROR: Unable to post scan results to Akkeris');
      console.log(err.message);
    }

    // Store result in S3
    try {
      const reportFilename = `${profile.scan_profile_token}_${Date.now()}.json`;
      await s3.uploadScanProfileDetails(reportFilename, JSON.stringify(fullReport), profile.scan_profile_token);
      await db.updateScanProfileReport(profile.scan_profile, reportFilename);
    } catch (err) {
      console.log('ERROR: Unable to upload result to S3');
      console.log(err.message);
      return;
    }

    // Delete profile
    await deleteProfile(profile);
    return;
  }

  if (scanStatus.state !== profile.scan_status) {
    await updateProfileStatus(profile, scanStatus.state);
    try {
      await akkeris.updateReleaseStatus(profile.token, profile.app_name, profile.release, profile.status_id, 'pending', `Detectify scan ${scanStatus.state}`);
    } catch (err) {
      console.log('ERROR: Unable to update scan profile status in the Akkeris release');
      console.log(err.message);
    }
  }
}

// Get pending tasks and process them
async function run() {
  let scanProfiles;
  try {
    scanProfiles = await db.getPendingProfiles();
  } catch (err) {
    console.log('ERROR: Unable to retrieve pending scan profiles from the database');
    console.log(err.message);
  }

  if (scanProfiles.length === 0) {
    return;
  }

  scanProfiles.forEach(processScanProfile);
}

module.exports = {
  run,
};
