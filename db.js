/* eslint no-param-reassign: off, max-len: off  */

const pg = require('pg');
const url = require('url');
const fs = require('fs');

let pgPool;

async function query(queryStatement, ...parameters) {
  parameters = parameters.map((x) => {
    if (typeof (x) === 'undefined') {
      return null;
    }
    return x;
  });
  const client = await pgPool.connect();
  let finalResult = [];
  try {
    const result = await client.query(queryStatement, parameters);
    finalResult = result.rows;
  } finally {
    client.release();
  }
  return finalResult;
}

function init() {
  const dbURL = new url.URL(process.env.DATABASE_URL);
  const dbConfig = {
    user: dbURL.username ? dbURL.username : '',
    password: dbURL.password ? dbURL.password : '',
    host: dbURL.hostname,
    database: dbURL.pathname.replace(/^\//, ''),
    port: dbURL.port,
    max: 10,
    idleTimeoutMillis: 30000,
    ssl: false,
  };

  pgPool = new pg.Pool(dbConfig);
  pgPool.on('error', (err) => { console.error('Postgres Pool Error: ', err); });
  try {
    query(fs.readFileSync('./create.sql').toString('utf8'));
  } catch (err) {
    console.log('Error running database migration!');
    console.log(err);
    process.exit(1);
  }
}

async function storeRelease(releaseID, appName, statusID, payload) {
  const queryStatement = 'insert into releases (release, app_name, status_id, payload) values ($1, $2, $3, $4) returning *';
  return query(queryStatement, releaseID, appName, statusID, payload);
}

async function deleteRelease(releaseID) {
  const queryStatement = 'update releases set deleted = true, updated_at = now() where release = $1';
  return query(queryStatement, releaseID);
}

async function getScanProfile(scanProfileID) {
  const queryStatement = `
  select
    scan_profiles.scan_profile,
    scan_profiles.name,
    scan_profiles.endpoint,
    scan_profiles.scan_status,
    scan_profiles.scan_profile_token,
    scan_profiles.report_filename,
    scan_profiles.created_at,
    scan_profiles.akkeris_app,
    scan_profiles.success_threshold,
    releases.release,
    releases.payload,
    releases.status_id
  from scan_profiles
    left join releases on releases.release = scan_profiles.release
  where scan_profiles.scan_profile = $1;
  `;
  return (await query(queryStatement, scanProfileID))[0];
}


const insertScan = 'insert into scan_profiles (scan_profile, release, name, endpoint, akkeris_app, scan_status, scan_profile_token, success_threshold) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *';
const insertScanNoRelease = 'insert into scan_profiles (scan_profile, name, endpoint, akkeris_app, scan_status, scan_profile_token, success_threshold) values ($1, $2, $3, $4, $5, $6, $7) returning *';
const insertScanNoThreshold = 'insert into scan_profiles (scan_profile, release, name, endpoint, akkeris_app, scan_status, scan_profile_token) values ($1, $2, $3, $4, $5, $6, $7) returning *';
const insertScanNoReleaseOrThreshold = 'insert into scan_profiles (scan_profile, name, endpoint, akkeris_app, scan_status, scan_profile_token) values ($1, $2, $3, $4, $5, $6) returning *';
async function storeScanProfile(scanProfileID, scanProfile, status, releaseID, successThreshold) {
  if ((releaseID && releaseID !== '') && (successThreshold && successThreshold !== '')) {
    return query(insertScan, scanProfileID, releaseID, scanProfile.name, scanProfile.endpoint, scanProfile.akkeris_app, status, scanProfile.token, successThreshold);
  }

  if (!releaseID || releaseID === '') {
    return query(insertScanNoRelease, scanProfileID, scanProfile.name, scanProfile.endpoint, scanProfile.akkeris_app, status, scanProfile.token, successThreshold);
  }

  if (!successThreshold || successThreshold === '') {
    return query(insertScanNoThreshold, scanProfileID, releaseID, scanProfile.name, scanProfile.endpoint, scanProfile.akkeris_app, status, scanProfile.token);
  }

  return query(insertScanNoReleaseOrThreshold, scanProfileID, scanProfile.name, scanProfile.endpoint, scanProfile.akkeris_app, status, scanProfile.token);
}

async function updateScanProfileStatus(scanProfileID, status) {
  const queryStatement = 'update scan_profiles set scan_status = $2, updated_at = now() where scan_profile = $1';
  return query(queryStatement, scanProfileID, status);
}

async function updateScanProfileReport(scanProfileID, filename) {
  const queryStatement = 'update scan_profiles set report_filename = $2, updated_at = now() where scan_profile = $1';
  return query(queryStatement, scanProfileID, filename);
}

async function deleteScanProfile(scanProfileID) {
  const queryStatement = 'update scan_profiles set deleted = true, updated_at = now() where scan_profile = $1';
  return query(queryStatement, scanProfileID);
}

const insertError = 'insert into errors (error, description, release, scan_profile) values ($1, $2, $3, $4) returning *';
const insertErrorNoRelease = 'insert into errors (error, description, scan_profile) values ($1, $2, $3) returning *';
const insertErrorNoProfile = 'insert into errors (error, description, release) values ($1, $2, $3) returning *';
const insertErrorNoReleaseOrProfile = 'insert into errors (error, description) values ($1, $2) returning *';
async function storeError(errorID, description, scanProfileID, releaseID) {
  if ((scanProfileID && scanProfileID !== '') && (releaseID && releaseID !== '')) {
    return query(insertError, errorID, description, releaseID, scanProfileID);
  }

  if (!scanProfileID || scanProfileID === '') {
    return query(insertErrorNoProfile, errorID, description, releaseID);
  }

  if (!releaseID || releaseID === '') {
    return query(insertErrorNoRelease, errorID, description, scanProfileID);
  }

  return query(insertErrorNoReleaseOrProfile, errorID, description);
}

async function getError(errorID) {
  const queryStatement = `
    select
      errors.error as error,
      errors.description as description,
      errors.release as release,
      errors.scan_profile as scan_profile,
      errors.created_at as error_created_at,
      scan_profiles.name,
      scan_profiles.endpoint,
      scan_profiles.scan_status,
      scan_profiles.created_at as scan_profile_created_at,
      scan_profiles.akkeris_app,
      releases.status_id
    from errors
      left join scan_profiles on errors.scan_profile = scan_profiles.scan_profile
      left join releases on errors.release = releases.release
    where errors.error = $1;
  `;
  return (await query(queryStatement, errorID))[0];
}

async function getPendingProfiles() {
/*
  Possible states from Detectify API
        "starting",
        "running",`
        "stopping",
        "stopped",
        "unable_to_resolve",
        "unable_to_complete"
*/
  const queryStatement = `
    select
      scan_profiles.scan_profile,
      scan_profiles.name,
      scan_profiles.endpoint,
      scan_profiles.scan_status,
      scan_profiles.scan_profile_token,
      scan_profiles.created_at,
      scan_profiles.akkeris_app,
      scan_profiles.success_threshold,
      releases.release,
      releases.status_id
    from scan_profiles
      left join releases on releases.release = scan_profiles.release and releases.deleted = false
    where scan_profiles.deleted = false
      and (scan_profiles.scan_status = 'starting' or
          scan_profiles.scan_status = 'running' or
          scan_profiles.scan_status = 'stopping' or
          scan_profiles.scan_status = 'success' or
          scan_profiles.scan_status = 'fail' or
          scan_profiles.scan_status = 'error' or
          scan_profiles.scan_status = 'profile_created')
    order by
      scan_profiles.created_at desc;
  `;
  return query(queryStatement);
}

async function getRunningScans() {
  const queryStatement = `
      select
        scan_profiles.scan_profile,
        scan_profiles.name,
        scan_profiles.endpoint,
        scan_profiles.scan_status,
        scan_profiles.created_at,
        scan_profiles.updated_at,
        scan_profiles.akkeris_app,
        scan_profiles.success_threshold,
        releases.release,
        releases.status_id
      from scan_profiles
        left join releases on releases.release = scan_profiles.release and releases.deleted = false
      where scan_profiles.deleted = false 
        and (scan_profiles.scan_status = 'starting' or
            scan_profiles.scan_status = 'running' or
            scan_profiles.scan_status = 'stopping' or
            scan_profiles.scan_status = 'success' or
            scan_profiles.scan_status = 'fail' or
            scan_profiles.scan_status = 'error' or
            scan_profiles.scan_status = 'profile_created')
      order by
        scan_profiles.created_at desc;
    `;
  return query(queryStatement);
}

async function getAllScans() {
  const queryStatement = `
    select
      scan_profiles.scan_profile,
      scan_profiles.name,
      scan_profiles.endpoint,
      scan_profiles.scan_status,
      scan_profiles.created_at,
      scan_profiles.updated_at,
      scan_profiles.akkeris_app,
      scan_profiles.success_threshold,
      releases.release,
      releases.status_id,
      errors.error
    from scan_profiles
      left join releases on scan_profiles.release = releases.release
      left join errors on scan_profiles.scan_profile = errors.scan_profile
    order by
      scan_profiles.created_at desc;
  `;
  return query(queryStatement);
}

async function getSiteForApp(appName) {
  const queryStatement = 'select site from sites where akkeris_app = $1';
  return query(queryStatement, appName);
}


async function getAllSites() {
  return query('select * from sites');
}

async function deleteSite(appName) {
  const queryStatement = 'delete from sites where akkeris_app = $1';
  return query(queryStatement, appName);
}

async function storeSite(appName, site) {
  const queryStatement = 'insert into sites(akkeris_app, site) values($1, $2)';
  return query(queryStatement, appName, site);
}

async function updateSite(appName, site) {
  const queryStatement = 'update sites set site = $1 where akkeris_app = $2';
  return query(queryStatement, site, appName);
}

module.exports = {
  storeRelease,
  deleteRelease,
  storeScanProfile,
  updateScanProfileStatus,
  updateScanProfileReport,
  deleteScanProfile,
  storeError,
  getError,
  init,
  getPendingProfiles,
  getScanProfile,
  getRunningScans,
  getAllScans,
  getSiteForApp,
  getAllSites,
  deleteSite,
  storeSite,
  updateSite,
};
