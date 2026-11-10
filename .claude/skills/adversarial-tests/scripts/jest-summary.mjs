#!/usr/bin/env node
// Prints one tab-separated line per test from a Jest --json results file:
//
//   <status>  <spec path>  <full test name>  <first line of the failure message>  <its Expected and Received lines>
//
// The last column holds the failure's lines from its first Expected or Received line up to the stack trace, joined with " | ".
// A spec that fails to load prints a single line with status SUITE_ERROR.
//
//   node jest-summary.mjs <results.json> [<checkout root>]

import { readFileSync } from "node:fs";
import path from "node:path";

const [resultsFile, root = process.cwd()] = process.argv.slice(2);
const results = JSON.parse(readFileSync(resultsFile, "utf8"));

const MAX_DETAIL_LINES = 8;
const MAX_DETAIL_LINE_LENGTH = 200;

const messageLines = (message = "") =>
  message
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")
    .map((line) => line.trim());

const isFirstLine = (line) => line.length > 0 && !line.startsWith("●");

const firstLine = (message) => messageLines(message).find(isFirstLine) ?? "";

const expectedAndReceived = (message) => {
  const lines = messageLines(message);
  const after = lines.slice(lines.findIndex(isFirstLine) + 1);
  const start = after.findIndex((line) =>
    /^([-+] )?(expected|received)\b/i.test(line),
  );
  if (start === -1) {
    return "";
  }
  const end = after.findIndex((line, i) => i > start && line.startsWith("at "));
  const detail = after
    .slice(start, end === -1 ? undefined : end)
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/\s+/g, " ").slice(0, MAX_DETAIL_LINE_LENGTH));
  if (detail.length > MAX_DETAIL_LINES) {
    detail.splice(MAX_DETAIL_LINES, Infinity, "…");
  }
  return detail.join(" | ");
};

for (const suite of results.testResults) {
  const spec = path.relative(root, suite.name);
  if (suite.assertionResults.length === 0 && suite.status === "failed") {
    console.log(
      ["SUITE_ERROR", spec, "", firstLine(suite.message), ""].join("\t"),
    );
    continue;
  }
  for (const test of suite.assertionResults) {
    console.log(
      [
        test.status.toUpperCase(),
        spec,
        test.fullName,
        firstLine(test.failureMessages?.[0]),
        expectedAndReceived(test.failureMessages?.[0]),
      ].join("\t"),
    );
  }
}
