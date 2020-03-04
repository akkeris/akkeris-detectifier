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

async function storeRelease(payload, statusID, akkerisToken) {
  const queryStatement = 'insert into releases (release, app_name, status_id, token, payload) values ($1, $2, $3, $4, $5) returning *';
  return query(queryStatement, payload.release.id, payload.key, statusID, akkerisToken, payload);
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
    releases.release,
    releases.app_name,
    releases.payload,
    releases.status_id
  from scan_profiles
    inner join releases on releases.release = scan_profiles.release
  where scan_profiles.scan_profile = $1;
  `;
  return (await query(queryStatement, scanProfileID))[0];
}

async function storeScanProfile(scanProfileID, releaseID, scanProfile, status) {
  const queryStatement = 'insert into scan_profiles (scan_profile, release, name, endpoint, scan_status, scan_profile_token) values ($1, $2, $3, $4, $5, $6) returning *';
  return query(queryStatement, scanProfileID, releaseID, scanProfile.name, scanProfile.endpoint, status, scanProfile.token);
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

async function storeError(errorID, description, releaseID, scanProfileID) {
  let queryStatement = 'insert into errors (error, description, release';

  if (scanProfileID) {
    queryStatement = `${queryStatement}, scan_profile) values ($1, $2, $3, $4) returning *`;
    return query(queryStatement, errorID, description, releaseID, scanProfileID);
  }

  queryStatement = `${queryStatement}) values ($1, $2, $3) returning *`;
  return query(queryStatement, errorID, description, releaseID);
}

async function getError(errorID) {
  return (await query('select error, description, release, scan_profile, created_at from errors where error = $1', errorID))[0];
}

async function getPendingProfiles() {
/*
  Possible states from Detectify API
        "starting",
        "running",
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
      releases.release,
      releases.app_name,
      releases.status_id,
      releases.token
    from scan_profiles
      inner join releases on releases.release = scan_profiles.release
    where (scan_profiles.deleted = false and releases.deleted = false) 
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
        releases.release,
        releases.app_name,
        releases.status_id
      from scan_profiles
        inner join releases on releases.release = scan_profiles.release
      where (scan_profiles.deleted = false and releases.deleted = false) 
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
      releases.release,
      releases.app_name,
      releases.status_id
    from scan_profiles
      inner join releases on releases.release = scan_profiles.release
    order by
      scan_profiles.created_at desc;
  `;
  return query(queryStatement);
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
};
