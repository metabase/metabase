const fs = require("fs");

const logger = { debug: console.debug, error: console.error };

const collectTestsByType = ({ type, suite, path, cache = [] }) => {
  logger.debug(`Collecting tests of type ${type}`);
  const localCache = cache;
  const { [type]: typeList, suites, tests } = suite;

  for (const uuid of typeList) {
    const foundTestByUuid = tests.find(test => test.uuid === uuid);
    if (!foundTestByUuid) {
      logger.error(`Test with uuid ${uuid} not found`);
      throw new Error(`Test with uuid ${uuid} not found`);
    }
    logger.debug(`Found test with uuid ${uuid}`);
    foundTestByUuid.path = path;
    localCache.push({ path, ...foundTestByUuid });
  }

  for (const subSuite of suites) {
    collectTestsByType({
      type,
      suite: subSuite,
      path: subSuite.file || path,
      cache: localCache,
    });
  }

  return localCache;
};

const extractTestResultsInfo = ({ results, stats }) => {
  logger.debug("Extracting test results information");

  const testType = "failures";

  const failedTests = results.flatMap(result =>
    collectTestsByType({
      type: testType,
      suite: result,
      path: result.file,
    }),
  );

  logger.debug("Finished extracting test results information");

  return {
    failedTests,
  };
};

function parseReport() {
  const content = fs.readFileSync(
    "./cypress/reports/cypress-test-report.json",
    "utf-8",
  );

  const data = JSON.parse(content);

  return extractTestResultsInfo(data).failedTests.map(test => ({
    title: test.fullTitle,
    error: test.err?.message,
    path: test.path,
  }));
}

exports.parseReport = parseReport;

const groupTestsByPath = report => {
  return report.reduce((acc, item) => {
    if (!acc[item.path]) {
      acc[item.path] = [];
    }
    acc[item.path].push(item);

    return acc;
  }, {});
};

function formatSummary(report) {
  const failedTestsByPath = groupTestsByPath(report);

  let summary = "### Failed Tests Summary\n\n";

  for (const [path, tests] of Object.entries(failedTestsByPath)) {
    summary += `| ${path} |\n`;
    summary += "| :--- |\n";

    tests.forEach(test => {
      summary += `| ${test.title}`;
      summary += "<p></p>"; // adds extra space after title
      summary += `<details>`;
      summary += "<summary>❌ ";
      summary += `<code>${truncateError(test.error)}</code>`;
      summary += "</summary>";
      summary += `<pre>${test.error}</pre>`.replaceAll("\n", "<br>");
      summary += `</details> |\n\n`;
    });
  }

  return summary;
}

function truncateError(error, maxLength = 100) {
  if (error.length <= maxLength) return error;
  return error.replaceAll("\n", "").substring(0, maxLength) + "...";
}

exports.formatSummary = formatSummary;
