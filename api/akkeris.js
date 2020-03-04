const axios = require('axios');

const CALLBACK_URL = process.env.CALLBACK_URL ? (
  /^https?:\/\/.+$/.test(process.env.CALLBACK_URL) ? process.env.CALLBACK_URL : `https://${process.env.CALLBACK_URL}`
) : 'http://localhost:9000';

const akkerisAPI = process.env.AKKERIS_API;

const getAkkerisAuthConfig = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

async function getAppDetails(token, appname) {
  return axios.get(`${akkerisAPI}/apps/${appname}`, getAkkerisAuthConfig(token));
}

async function createReleaseStatus(token, appname, releaseID, state, description) {
  const config = getAkkerisAuthConfig(token);
  config.headers['Content-Type'] = 'application/json';
  return axios.post(`${akkerisAPI}/apps/${appname}/releases/${releaseID}/statuses`, {
    state,
    context: 'security/detectify',
    name: 'Detectify',
    description,
    image_url: state === 'pending' ? `${CALLBACK_URL}/pending_sm.png` : undefined,
  }, config);
}

async function updateReleaseStatus(token, appname, releaseID, statusID, state, description, targetURL) {
  const config = getAkkerisAuthConfig(token);
  config.headers['Content-Type'] = 'application/json';
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
  return axios.patch(`${akkerisAPI}/apps/${appname}/releases/${releaseID}/statuses/${statusID}`, {
    state,
    name: 'Detectify',
    description,
    image_url: `${CALLBACK_URL}/${img}`,
    target_url: targetURL || undefined,
  }, config);
}

async function updateReleaseStatusWithError(token, appname, releaseID, statusID, errorID, errorType) {
  const config = getAkkerisAuthConfig(token);
  config.headers['Content-Type'] = 'application/json';
  return axios.patch(`${akkerisAPI}/apps/${appname}/releases/${releaseID}/statuses/${statusID}`, {
    state: 'error',
    name: 'Detectify',
    description: `Scan failed - ${errorType}`,
    target_url: `${CALLBACK_URL}/errors/${errorID}`,
    image_url: `${CALLBACK_URL}/failure_sm.png`,
  }, config);
}

module.exports = {
  createReleaseStatus,
  updateReleaseStatus,
  getAppDetails,
  updateReleaseStatusWithError,
};
