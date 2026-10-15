// The result files that the CI job reads: a JUnit report and a JSON summary,
// in the shapes that jest-junit and `jest --json` write. The quarantine gate
// knows a test by the classname, name and file in the JUnit report, so those
// three have to be what jest-junit writes for the same test.
import fs from "node:fs";
import path from "node:path";

import type { FailedTest } from "./reporters.ts";
import type {
  FileDone,
  FileResult,
  TestFailure,
  TestIdentity,
} from "./types.ts";

type IdentifiedFailure = TestFailure & { identity: TestIdentity };

type FileOutcome = {
  file: string;
  relative: string;
  passed: TestIdentity[];
  failed: IdentifiedFailure[];
  /**
   * Failures of the file itself, which no test can be blamed for.
   */
  broken: TestFailure[];
};

type WriteOptions = {
  junitFile?: string;
  jsonFile?: string;
  /**
   * The failures that did not repeat when their file ran alone. They count as
   * passed here, as they do for the exit code.
   */
  passedAlone?: FailedTest[];
};

const ESCAPE = String.fromCharCode(27);
const ANSI = new RegExp(`${ESCAPE}\\[[0-9;]*m`, "g");
// XML 1.0 cannot represent most control characters, escaped or not.
const UNREPRESENTABLE_IN_XML = new RegExp(
  `[^${String.fromCharCode(9, 10, 13)}\\u0020-\\uD7FF\\uE000-\\uFFFD]`,
  "g",
);

export function createCiResults({ root }: { root: string }) {
  const done: FileDone[] = [];
  return {
    add(fileDone: FileDone) {
      done.push(fileDone);
    },
    write({ junitFile, jsonFile, passedAlone = [] }: WriteOptions) {
      const outcomes = done.map(({ file, result }) =>
        outcomeOf(root, file, result, passedAlone),
      );
      if (junitFile) {
        writeFile(junitFile, junitReport(outcomes));
      }
      if (jsonFile) {
        writeFile(jsonFile, JSON.stringify(jsonSummary(outcomes)));
      }
    },
  };
}

function outcomeOf(
  root: string,
  file: string,
  result: FileResult,
  passedAlone: FailedTest[],
): FileOutcome {
  const forgiven = new Set(
    passedAlone.filter((entry) => entry.file === file).map(({ test }) => test),
  );
  const outcome: FileOutcome = {
    file,
    relative: path.relative(root, file),
    passed: [...result.passedTests],
    failed: [],
    broken: [],
  };
  for (const failure of result.failures) {
    if (!hasIdentity(failure)) {
      outcome.broken.push(failure);
    } else if (forgiven.has(failure.test)) {
      outcome.passed.push(failure.identity);
    } else {
      outcome.failed.push(failure);
    }
  }
  return outcome;
}

function junitReport(outcomes: FileOutcome[]): string {
  // jest-junit leaves out a file that did not run, so this does too. The JSON
  // summary is where the result check finds such a file.
  const ran = outcomes.filter((outcome) => outcome.broken.length === 0);
  const count = (key: "passed" | "failed") =>
    ran.reduce((total, outcome) => total + outcome[key].length, 0);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="jest tests" tests="${count("passed") + count("failed")}" failures="${count("failed")}">`,
  ];
  for (const outcome of ran) {
    const file = escapeXml(outcome.relative);
    const tests = outcome.passed.length + outcome.failed.length;
    lines.push(
      `  <testsuite name="${file}" tests="${tests}" failures="${outcome.failed.length}">`,
    );
    for (const identity of outcome.passed) {
      lines.push(`    <testcase ${testcaseAttributes(identity, file)}/>`);
    }
    for (const failure of outcome.failed) {
      lines.push(
        `    <testcase ${testcaseAttributes(failure.identity, file)}>`,
      );
      lines.push(
        `      <failure>${escapeXml(failure.stack || failure.message)}</failure>`,
      );
      lines.push("    </testcase>");
    }
    lines.push("  </testsuite>");
  }
  lines.push("</testsuites>");
  return `${lines.join("\n")}\n`;
}

// jest-junit's default templates are "{classname} {title}" for both.
function testcaseAttributes(identity: TestIdentity, file: string): string {
  const name = escapeXml(fullName(identity));
  return `classname="${name}" name="${name}" file="${file}"`;
}

function jsonSummary(outcomes: FileOutcome[]) {
  const testResults = outcomes.map((outcome) => ({
    name: outcome.file,
    status:
      outcome.failed.length + outcome.broken.length > 0 ? "failed" : "passed",
    message: outcome.broken.map((failure) => plain(failure.message)).join("\n"),
    // jest leaves this empty for a file that did not run, and the result
    // check reads an empty list as a failure of the runner.
    assertionResults:
      outcome.broken.length > 0
        ? []
        : [
            ...outcome.passed.map((identity) =>
              assertion(identity, "passed", []),
            ),
            ...outcome.failed.map((failure) =>
              assertion(failure.identity, "failed", [
                plain(failure.stack || failure.message),
              ]),
            ),
          ],
  }));
  const failedSuites = testResults.filter(
    (suite) => suite.status === "failed",
  ).length;
  const sum = (key: "passed" | "failed") =>
    outcomes.reduce((total, outcome) => total + outcome[key].length, 0);
  return {
    success: failedSuites === 0,
    wasInterrupted: false,
    numTotalTestSuites: testResults.length,
    numFailedTestSuites: failedSuites,
    numPassedTestSuites: testResults.length - failedSuites,
    numFailedTests: sum("failed"),
    numPassedTests: sum("passed"),
    testResults,
  };
}

function assertion(
  identity: TestIdentity,
  status: "passed" | "failed",
  failureMessages: string[],
) {
  return {
    ancestorTitles: identity.ancestors,
    title: identity.title,
    fullName: fullName(identity),
    status,
    failureMessages,
  };
}

function hasIdentity(failure: TestFailure): failure is IdentifiedFailure {
  return failure.identity !== undefined;
}

function fullName({ ancestors, title }: TestIdentity): string {
  return [...ancestors, title].join(" ");
}

function plain(text: string): string {
  return text.replace(ANSI, "");
}

function escapeXml(text: string): string {
  return plain(text)
    .replace(UNREPRESENTABLE_IN_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, content);
}
