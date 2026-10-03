const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(process.env.REPO_ROOT || path.join(__dirname, "../../.."));
const BUN = path.join(REPO_ROOT, "node_modules/.bun");
const reportersDir = fs.readdirSync(BUN).find((d) => d.startsWith("@jest+reporters@"));
const libDir = path.join(BUN, reportersDir, "node_modules");
const libCoverage = require(path.join(libDir, "istanbul-lib-coverage"));
const libSourceMaps = require(path.join(libDir, "istanbul-lib-source-maps"));

class PerSpecCoverageReporter {
  constructor(globalConfig, options) {
    this.rootDir = globalConfig.rootDir;
    this.out = (options && options.out) || process.env.PER_SPEC_COV_OUT;
    this.statementMaps = new Map();
  }

  rel(p) {
    return path.relative(this.rootDir, p);
  }

  async onTestFileResult(_test, testResult) {
    const record = {
      spec: this.rel(testResult.testFilePath),
      execError: testResult.testExecError ? String(testResult.testExecError.message).slice(0, 300) : null,
      tests: testResult.testResults.map((t) => ({ fullName: t.fullName, status: t.status })),
      files: {},
    };
    if (testResult.coverage) {
      const map = libCoverage.createCoverageMap(testResult.coverage);
      const mapped = await libSourceMaps.createSourceMapStore().transformCoverage(map);
      for (const f of mapped.files()) {
        const fc = mapped.fileCoverageFor(f);
        const file = this.rel(f);
        if (!this.statementMaps.has(file)) {
          const sm = fc.statementMap;
          this.statementMaps.set(
            file,
            Object.keys(sm).map((k) => [sm[k].start.line, sm[k].start.column, sm[k].end.line, sm[k].end.column]),
          );
          fs.appendFileSync(
            this.out.replace(/\.jsonl$/, ".statements.jsonl"),
            JSON.stringify({ file, statements: this.statementMaps.get(file) }) + "\n",
          );
        }
        const hit = Object.keys(fc.s).filter((k) => fc.s[k] > 0).map(Number);
        if (hit.length) record.files[file] = hit;
      }
    }
    fs.appendFileSync(this.out, JSON.stringify(record) + "\n");
  }
}

module.exports = PerSpecCoverageReporter;
