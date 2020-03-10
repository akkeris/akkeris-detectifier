/* eslint-env browser  */

let fullReport;
let profileID;
let reportFilename;

async function fetchReport() {
  return (await fetch(`/v1/reports/${profileID}`)).json();
}

async function render() { // eslint-disable-line
  const el = document.getElementById('json-viewer');
  const loader = document.getElementById('pacman-loader');

  if (el.innerHTML !== '') {
    el.innerHTML = '';
  } else {
    if (!fullReport) {
      loader.style.display = 'block';
      try {
        fullReport = await fetchReport();
      } catch (err) {
        el.innerHTML = 'Error displaying full report';
        console.log(err.message);
        return;
      }
      loader.style.display = 'none';
    }
    const formatter = new JSONFormatter(fullReport); // eslint-disable-line
    el.appendChild(formatter.render());
  }
}

async function startDownload() { // eslint-disable-line
  if (!fullReport) {
    try {
      fullReport = await fetchReport();
    } catch (err) {
      console.log(err.message);
      return;
    }
  }
  const dataString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(fullReport))}`;
  const dlAnchorElem = document.getElementById('downloadAnchorElem');
  dlAnchorElem.setAttribute('href', dataString);
  dlAnchorElem.setAttribute('download', reportFilename);
  dlAnchorElem.click();
}

window.addEventListener('load', async () => {
  profileID = document.getElementsByName('profile-id')[0].content;
  reportFilename = document.getElementsByName('report-filename')[0].content;
  if (!reportFilename) {
    return;
  }
  try {
    fullReport = await fetchReport();
  } catch (err) {
    console.log(err.message);
  }
  document.getElementById('cvss').innerHTML = fullReport.cvss;
  document.getElementById('num-findings').innerHTML = fullReport.findings.length;
  fullReport.findings.forEach((f) => console.log(f.tags.map((t) => t.type)));
});
