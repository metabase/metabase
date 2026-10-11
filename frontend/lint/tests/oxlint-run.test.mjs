import assert from "node:assert/strict";
import test from "node:test";

import { getOxlintArgs } from "../scripts/run-oxlint.mjs";

const flags = [
  "--disable-nested-config",
  "--max-warnings",
  "0",
  "--report-unused-disable-directives",
];
const defaultPaths = ["enterprise/frontend", "frontend", "e2e"];
const file = "frontend/src/metabase/dev.ts";
const pathExists = (arg) => arg === file;

test("should lint the default paths when no arguments are given", () => {
  assert.deepEqual(getOxlintArgs([], pathExists), [...flags, ...defaultPaths]);
});

test("should lint the default paths when only --fix is given", () => {
  assert.deepEqual(
    getOxlintArgs(["--fix"], () => true),
    [...flags, "--fix", ...defaultPaths],
  );
});

test("should lint only an existing file when one is given", () => {
  assert.deepEqual(getOxlintArgs([file], pathExists), [...flags, file]);
});

test("should lint the default paths when a flag value is not an existing path", () => {
  assert.deepEqual(getOxlintArgs(["--format", "json"], pathExists), [
    ...flags,
    "--format",
    "json",
    ...defaultPaths,
  ]);
});

test("should lint only an existing file when it is given with --fix", () => {
  assert.deepEqual(getOxlintArgs(["--fix", file], pathExists), [
    ...flags,
    "--fix",
    file,
  ]);
});

test("should pass a missing path to oxlint without the default paths", () => {
  assert.deepEqual(getOxlintArgs(["frontend/src/nope.ts"], pathExists), [
    ...flags,
    "frontend/src/nope.ts",
  ]);
});

test("should pass a missing file name to oxlint without the default paths", () => {
  assert.deepEqual(getOxlintArgs(["dev.ts"], pathExists), [...flags, "dev.ts"]);
});

test("should lint only an existing directory when one is given", () => {
  assert.deepEqual(
    getOxlintArgs(["frontend"], (arg) => arg === "frontend"),
    [...flags, "frontend"],
  );
});
