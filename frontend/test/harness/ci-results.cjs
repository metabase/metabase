// The result files that the CI job reads: a JUnit report and a JSON summary, in
// the shapes that jest-junit and `jest --json` write. The quarantine gate keys a
// test on its classname, name and file in the JUnit report, so those three have
// to be what jest-junit would have written for the same test.
const fs = require("node:fs");
const path = require("node:path");

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
// XML 1.0 has no way to write most control characters, escaped or not.
const UNWRITABLE = new RegExp(`[^${String.fromCharCode(9, 10, 13)}\\u0020-\\uD7FF\\uE000-\\uFFFD]`, "g");
const escapeXml = (text) =>
  String(text).replace(ANSI, "").replace(UNWRITABLE, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
// jest-junit's default templates: "{classname} {title}" for both attributes.
const fullName = ({ ancestors, title }) => [...ancestors, title].join(" ");

const createCiResults = ({ root }) => {
  const files = [];
  return {
    add({ file, result }) { files.push({ file, result }); },
    // passedAlone: the failures that did not repeat when their file ran alone.
    // They count as passed here, as they do for the exit code.
    write({ junitFile, jsonFile, passedAlone = [] }) {
      const forgiven = new Set(passedAlone.map(({ file, test }) => `${file}\n${test}`));
      const suites = files.map(({ file, result }) => {
        const failures = result.failures.filter((failure) => !forgiven.has(`${file}\n${failure.test}`));
        const passed = [...result.passedTests, ...result.failures.filter((failure) => !failures.includes(failure) && failure.title !== undefined)];
        return {
          file,
          relative: path.relative(root, file),
          passed,
          failed: failures.filter((failure) => failure.title !== undefined),
          // A failure of the file itself, which no test can be blamed for.
          broken: failures.filter((failure) => failure.title === undefined),
        };
      });

      if (junitFile) {
        // jest-junit leaves out a file that did not run, so this does too. The
        // JSON summary is where the result check finds such a file.
        const ran = suites.filter((suite) => suite.broken.length === 0);
        const count = (key) => ran.reduce((total, suite) => total + suite[key].length, 0);
        const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
        lines.push(`<testsuites name="jest tests" tests="${count("passed") + count("failed")}" failures="${count("failed")}">`);
        for (const suite of ran) {
          const file = escapeXml(suite.relative);
          lines.push(`  <testsuite name="${file}" tests="${suite.passed.length + suite.failed.length}" failures="${suite.failed.length}">`);
          for (const test of suite.passed) lines.push(`    <testcase classname="${escapeXml(fullName(test))}" name="${escapeXml(fullName(test))}" file="${file}"/>`);
          for (const failure of suite.failed) {
            lines.push(`    <testcase classname="${escapeXml(fullName(failure))}" name="${escapeXml(fullName(failure))}" file="${file}">`);
            lines.push(`      <failure>${escapeXml(failure.stack || failure.message)}</failure>`);
            lines.push("    </testcase>");
          }
          lines.push("  </testsuite>");
        }
        lines.push("</testsuites>");
        fs.mkdirSync(path.dirname(path.resolve(junitFile)), { recursive: true });
        fs.writeFileSync(junitFile, lines.join("\n") + "\n");
      }

      if (jsonFile) {
        const assertion = (test, status, failureMessages) => ({ ancestorTitles: test.ancestors, title: test.title, fullName: fullName(test), status, failureMessages });
        const testResults = suites.map((suite) => ({
          name: suite.file,
          status: suite.failed.length + suite.broken.length > 0 ? "failed" : "passed",
          message: suite.broken.map((failure) => failure.message.replace(ANSI, "")).join("\n"),
          // jest leaves this empty for a file that did not run, and the result
          // check reads an empty list as a failure of the runner.
          assertionResults: suite.broken.length > 0 ? [] : [
            ...suite.passed.map((test) => assertion(test, "passed", [])),
            ...suite.failed.map((failure) => assertion(failure, "failed", [(failure.stack || failure.message).replace(ANSI, "")])),
          ],
        }));
        const failedSuites = testResults.filter((suite) => suite.status === "failed").length;
        fs.mkdirSync(path.dirname(path.resolve(jsonFile)), { recursive: true });
        fs.writeFileSync(jsonFile, JSON.stringify({
          success: failedSuites === 0,
          wasInterrupted: false,
          numTotalTestSuites: testResults.length,
          numFailedTestSuites: failedSuites,
          numPassedTestSuites: testResults.length - failedSuites,
          numFailedTests: suites.reduce((total, suite) => total + suite.failed.length, 0),
          numPassedTests: suites.reduce((total, suite) => total + suite.passed.length, 0),
          testResults,
        }));
      }
    },
  };
};

module.exports = { createCiResults };
