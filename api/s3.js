const AWS = require('aws-sdk');

let s3;

function init() {
  AWS.config.update({
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  });
  s3 = new AWS.S3();
}

async function uploadScanProfileDetails(filename, payload, scanProfileToken) {
  return s3.putObject({
    Body: payload,
    Bucket: process.env.S3_BUCKET,
    Key: filename,
    Metadata: {
      scanProfileToken,
    },
  }).promise();
}

async function getObject(filename) {
  return s3.getObject({
    Bucket: process.env.S3_BUCKET,
    Key: filename,
  }).promise();
}

module.exports = {
  init,
  uploadScanProfileDetails,
  s3,
  getObject,
};
