const axios = require('axios');

const CALLBACK_URL = process.env.CALLBACK_URL ? (
  /^https?:\/\/.+$/.test(process.env.CALLBACK_URL) ? process.env.CALLBACK_URL : `https://${process.env.CALLBACK_URL}`
) : 'http://localhost:9000';

const controllerAPI = process.env.AKKERIS_APP_CONTROLLER;
const serviceToken = process.env.AKKERIS_SERVICE_TOKEN;

const akkerisAuthConfig = { headers: { Authorization: `Bearer ${serviceToken}` } };

async function getAppDetails(appname) {
  return axios.get(`${controllerAPI}/apps/${appname}`, akkerisAuthConfig);
}

async function createReleaseStatus(appname, releaseID, state, description) {
  akkerisAuthConfig.headers['Content-Type'] = 'application/json';
  return axios.post(`${controllerAPI}/apps/${appname}/releases/${releaseID}/statuses`, {
    state,
    context: 'security/detectify',
    name: 'Detectify',
    description,
    image_url: state === 'pending' ? `${CALLBACK_URL}/pending_sm.png` : undefined,
  }, akkerisAuthConfig);
}

async function updateReleaseStatus(appname, releaseID, statusID, state, description, targetURL) {
  akkerisAuthConfig.headers['Content-Type'] = 'application/json';
  let img;
  switch (state) {
    case 'success':
      img = 'success_sm.png';
      break;
    case 'failure':
      img = 'failure_sm.png';
      break;
    default:
      img = 'pending_sm.png';
  }
  return axios.patch(`${controllerAPI}/apps/${appname}/releases/${releaseID}/statuses/${statusID}`, {
    state,
    name: 'Detectify',
    description,
    image_url: `${CALLBACK_URL}/${img}`,
    target_url: targetURL || undefined,
  }, akkerisAuthConfig);
}

async function updateReleaseStatusWithError(appname, releaseID, statusID, errorID, errorType) {
  akkerisAuthConfig.headers['Content-Type'] = 'application/json';
  return axios.patch(`${controllerAPI}/apps/${appname}/releases/${releaseID}/statuses/${statusID}`, {
    state: 'error',
    name: 'Detectify',
    description: `Scan failed - ${errorType}`,
    target_url: `${CALLBACK_URL}/errors/${errorID}`,
    image_url: `${CALLBACK_URL}/failure_sm.png`,
  }, akkerisAuthConfig);
}

async function sendErrorEvent(appName, message, errorID) {
  return axios.post(`${controllerAPI}/events`, {
    action: 'security_scan',
    key: appName,
    status: 'error',
    service_name: 'detectify',
    message,
    link: `${CALLBACK_URL}/errors/${errorID}`,
  }, akkerisAuthConfig);
}

async function sendResultEvent(appName, status, message, link) {
  return axios.post(`${controllerAPI}/events`, {
    action: 'security_scan',
    key: appName,
    status,
    service_name: 'detectify',
    message,
    link,
  }, akkerisAuthConfig);
}

module.exports = {
  createReleaseStatus,
  updateReleaseStatus,
  getAppDetails,
  updateReleaseStatusWithError,
  sendErrorEvent,
  sendResultEvent,
};
