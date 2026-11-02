const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

function istanbul(rootDir) {
  const fromRoot = createRequire(path.join(rootDir, "package.json"));
  const core = createRequire(fromRoot.resolve("jest/package.json")).resolve("@jest/core/package.json");
  const reporters = createRequire(core).resolve("@jest/reporters/package.json");
  const req = createRequire(reporters);
  return { coverage: req("istanbul-lib-coverage"), sourceMaps: req("istanbul-lib-source-maps") };
}

class ResultsReporter {
  constructor(globalConfig, options) {
    this.rootDir = globalConfig.rootDir;
    this.out = (options && options.out) || process.env.REPLACEMENT_CHECK_RESULTS;
    this.suites = [];
    this.statements = {};
  }

  async onTestFileResult(_test, result) {
    const spec = path.relative(this.rootDir, result.testFilePath);
    const suite = {
      spec,
      exec_error: result.testExecError ? String(result.testExecError.message).slice(0, 2000) : null,
      failure_message: result.testResults.length === 0 && result.failureMessage ? String(result.failureMessage).slice(0, 2000) : null,
      tests: result.testResults.map((t) => ({
        full_name: t.fullName,
        status: t.status,
        message: t.status === "failed" ? (t.failureMessages || []).join("\n").slice(0, 2000) : null,
      })),
      covered: result.coverage ? {} : null,
    };
    if (result.coverage) {
      const lib = istanbul(this.rootDir);
      const map = lib.coverage.createCoverageMap(result.coverage);
      const mapped = await lib.sourceMaps.createSourceMapStore().transformCoverage(map);
      for (const f of mapped.files()) {
        const fc = mapped.fileCoverageFor(f);
        const file = path.relative(this.rootDir, f);
        const sm = fc.statementMap;
        this.statements[file] ??= Object.keys(sm).map((k) => [sm[k].start.line, sm[k].end.line]);
        const hit = Object.keys(fc.s).filter((k) => fc.s[k] > 0).map(Number);
        suite.covered[file] = hit;
      }
    }
    this.suites.push(suite);
  }

  onRunComplete() {
    fs.writeFileSync(this.out, JSON.stringify({ suites: this.suites, statements: this.statements }));
  }
}

module.exports = ResultsReporter;
