const fs = require("fs");

const { merge } = require("mochawesome-merge");
const marge = require("mochawesome-report-generator");

/**
 * Merge multiple individual mochawesome reports into a single file,
 * and then generate a human-readable HTML page from it.
 *
 * @param {string} reportDir
 */
function generateReport(reportDir) {
  const files = [`${reportDir}/mochareports/*.json`];
  const output = `${reportDir}/cypress-test-report.json`;

  return merge({ files }).then(report => {
    const content = JSON.stringify(report, null, 2);
    fs.writeFileSync(output, content, { flag: "w" });

    marge.create(report, {
      reportDir,
      inline: true,
      reportFilename: "cypress-test-report.html",
    });
  });
}

module.exports = { generateReport };
