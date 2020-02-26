const axios = require('axios');

const detectifyAPI = process.env.DETECTIFY_API;
const detectifyKey = process.env.DETECTIFY_API_KEY;

const authConfig = { headers: { 'X-Detectify-Key': detectifyKey } };

async function getDomains() {
  return axios.get(`${detectifyAPI}/rest/v2/domains/`, authConfig);
}

async function createScanProfile(domainToken, hostname) {
  const payload = {
    domain_token: domainToken,
    name: `akkeris-${hostname}`,
    endpoint: hostname,
    unique: false,
    valid: false,
  };
  const config = authConfig;
  config.headers['Content-Type'] = 'application/json';
  return axios.post(`${detectifyAPI}/rest/v2/profiles/`, payload, config);
}

async function deleteScanProfile(scanProfileToken) {
  return axios.delete(`${detectifyAPI}/rest/v2/profiles/${scanProfileToken}/`, authConfig);
}

async function startScan(scanProfileToken) {
  return axios.post(`${detectifyAPI}/rest/v2/scans/${scanProfileToken}/`, null, authConfig);
}

async function getScanStatus(scanProfileToken) {
  return axios.get(`${detectifyAPI}/rest/v2/scans/${scanProfileToken}/`, authConfig);
}

async function getFullScanReport(scanProfileToken) {
  return axios.get(`${detectifyAPI}/rest/v2/fullreports/${scanProfileToken}/latest/`, authConfig);
}

module.exports = {
  createScanProfile,
  deleteScanProfile,
  getDomains,
  getScanStatus,
  startScan,
  getFullScanReport,
};
