#!/usr/bin/env node
// Prints one tab-separated line per test from a Jest --json results file:
//
//   <status>  <spec path>  <full test name>  <first line of the failure message>
//
// A spec that fails to load prints a single line with status SUITE_ERROR.
//
//   node jest-summary.mjs <results.json> [<checkout root>]

import { readFileSync } from "node:fs";
import path from "node:path";

const [resultsFile, root = process.cwd()] = process.argv.slice(2);
const results = JSON.parse(readFileSync(resultsFile, "utf8"));

const firstLine = (message = "") =>
  message
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("●")) ?? "";

for (const suite of results.testResults) {
  const spec = path.relative(root, suite.name);
  if (suite.assertionResults.length === 0 && suite.status === "failed") {
    console.log(["SUITE_ERROR", spec, "", firstLine(suite.message)].join("\t"));
    continue;
  }
  for (const test of suite.assertionResults) {
    console.log(
      [
        test.status.toUpperCase(),
        spec,
        test.fullName,
        firstLine(test.failureMessages?.[0]),
      ].join("\t"),
    );
  }
}
