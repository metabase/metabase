const fs = require("node:fs");

class JsonLiteReporter {
  constructor(globalConfig, options) {
    this.out = (options && options.out) || process.env.JSON_LITE_OUT;
  }

  onRunComplete(_contexts, results) {
    const lite = {
      testResults: results.testResults.map((suite) => ({
        name: suite.testFilePath,
        status: suite.testExecError || suite.failureMessage && suite.testResults.length === 0 ? "failed" : "passed",
        message: String(suite.testExecError?.message ?? suite.failureMessage ?? "").slice(0, 4000),
        assertionResults: suite.testResults.map((t) => ({
          fullName: t.fullName,
          status: t.status,
          failureMessages: (t.failureMessages || []).map((m) => String(m).slice(0, 4000)),
        })),
      })),
    };
    fs.writeFileSync(this.out, JSON.stringify(lite));
  }
}

module.exports = JsonLiteReporter;
