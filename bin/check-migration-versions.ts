#!/usr/bin/env tsx
//
// Check that new migration files target the correct version.
//
// Usage:
//   bin/check-migration-versions <BASE_REF> [CURRENT_VERSION]
//
// In CI, BASE_REF and CURRENT_VERSION are set via env vars. Locally they
// can be passed as arguments.
//
// For PRs targeting a release branch, the expected version is derived from
// the branch name. For PRs targeting master, CURRENT_VERSION must be set
// and the expected version is current+1.
//
// Checks:
//   1. New migration files are in the correct version directory (e.g. 061/)
//   2. Changeset IDs inside those files use the correct version prefix (e.g. v61.)
//
// In CI, set CHANGED_FILES to a TSV file of "status\tpath" (from the GitHub
// API) to avoid needing full git history. Falls back to git diff locally.

/* eslint-disable no-console */

import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";

import { load } from "js-yaml";

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf-8" }).trim();
}

// -- Resolve base ref --------------------------------------------------------

const baseRef = process.argv[2] ?? process.env.BASE_REF;

if (!baseRef) {
  console.error("ERROR: No base ref. Pass as argument or set BASE_REF.");
  process.exit(1);
}

if (!/^[\w.\-/]+$/.test(baseRef)) {
  console.error(`ERROR: Invalid base ref: ${baseRef}`);
  process.exit(1);
}

console.log(`BASE_REF: ${baseRef}`);

// -- Determine the expected migration version for this target branch ---------

let expectedVersion: number;

const releaseBranchMatch = baseRef.match(/^release-x\.(\d+)\.x$/);
if (releaseBranchMatch) {
  expectedVersion = Number(releaseBranchMatch[1]);
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    console.error(
      `ERROR: Could not derive a valid version from branch name: '${baseRef}'`,
    );
    process.exit(1);
  }
} else if (baseRef === "master") {
  const currentVersionStr = process.argv[3] ?? process.env.CURRENT_VERSION;
  if (!currentVersionStr) {
    console.error(
      "ERROR: CURRENT_VERSION is not set. Export it before running this script.",
    );
    process.exit(1);
  }
  console.log(`CURRENT_VERSION: ${currentVersionStr}`);
  const currentVersion = Number(currentVersionStr);
  if (!Number.isInteger(currentVersion) || currentVersion <= 0) {
    console.error(
      `ERROR: CURRENT_VERSION must be a positive integer, got: '${currentVersionStr}'`,
    );
    process.exit(1);
  }
  expectedVersion = currentVersion + 1;
} else {
  console.log(
    `Target branch '${baseRef}' is not master or a release branch — skipping check.`,
  );
  process.exit(0);
}

const expectedDir = String(expectedVersion).padStart(3, "0");
console.log(
  `Expected migration version: v${expectedVersion} (directory ${expectedDir}/)\n`,
);

// -- Find new and modified migration files ------------------------------------

let newFiles: string[] = [];
let modifiedFiles: string[] = [];

// -- Ensure base ref is available (needed for git diff and git show) ----------

function ensureBaseRef(): void {
  try {
    git("rev-parse", `origin/${baseRef}`);
  } catch {
    try {
      git("fetch", "origin", baseRef, "--depth=1");
    } catch {
      console.error(`ERROR: Could not fetch origin/${baseRef}`);
      process.exit(1);
    }
  }
}

const changedFilesPath = process.env.CHANGED_FILES;
if (changedFilesPath && existsSync(changedFilesPath)) {
  // CI path: read pre-computed file list from GitHub API
  console.log(`Reading changed files from ${changedFilesPath}`);
  for (const line of readFileSync(changedFilesPath, "utf-8").split("\n")) {
    if (!line) {
      continue;
    }
    const [status, file] = line.split("\t");
    if (status === "added") {
      newFiles.push(file);
    } else if (status === "modified") {
      modifiedFiles.push(file);
    }
  }
} else {
  // Local path: use git diff
  console.log("Using git diff to find changed files");
  ensureBaseRef();

  function changedFiles(filter: string): string[] {
    return git(
      "diff",
      "--name-only",
      `--diff-filter=${filter}`,
      `origin/${baseRef}..HEAD`,
      "--",
      "resources/migrations/**/*.yaml",
    )
      .split("\n")
      .filter(Boolean);
  }

  newFiles = changedFiles("A");
  modifiedFiles = changedFiles("M");
}

// In CI, we still need the base ref to git show old file contents
if (modifiedFiles.length > 0) {
  ensureBaseRef();
}

if (newFiles.length === 0 && modifiedFiles.length === 0) {
  console.log("No new or modified migration files.");
  process.exit(0);
}

// -- Helpers ------------------------------------------------------------------

type ChangeLog = {
  databaseChangeLog?: Array<{ changeSet?: { id?: string } }>;
} | null;

function getChangeSetIds(doc: ChangeLog): Set<string> {
  const ids = new Set<string>();
  for (const entry of doc?.databaseChangeLog ?? []) {
    const id = entry.changeSet?.id;
    if (id) {
      ids.add(id);
    }
  }
  return ids;
}

function checkVersion(file: string, id: string): boolean {
  const m = id.match(/^v(\d+)\./);
  if (m && Number(m[1]) !== expectedVersion) {
    console.error(
      `ERROR: ${file}: changeset id "${id}" uses v${m[1]} but expected v${expectedVersion}`,
    );
    return false;
  }
  return true;
}

// -- Validate -----------------------------------------------------------------

let errors = 0;

// New files: check directory and all changeset IDs
for (const file of newFiles) {
  const dirMatch = file.match(/^resources\/migrations\/(\d+)\//);
  if (dirMatch && dirMatch[1] !== expectedDir) {
    console.error(
      `ERROR: ${file}: in directory ${dirMatch[1]}/ but expected ${expectedDir}/`,
    );
    errors++;
  }

  const doc = load(readFileSync(file, "utf-8")) as ChangeLog;
  for (const id of getChangeSetIds(doc)) {
    if (!checkVersion(file, id)) {
      errors++;
    }
  }
}

// Modified files: only check changeset IDs that were added
for (const file of modifiedFiles) {
  const oldContent = git("show", `origin/${baseRef}:${file}`);
  const oldIds = getChangeSetIds(load(oldContent) as ChangeLog);
  const newIds = getChangeSetIds(
    load(readFileSync(file, "utf-8")) as ChangeLog,
  );

  for (const id of newIds) {
    if (!oldIds.has(id) && !checkVersion(file, id)) {
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} error(s) found.\n`);
  console.error(
    `PRs targeting ${baseRef} should use version v${expectedVersion} (directory ${expectedDir}/).`,
  );
  process.exit(1);
}

console.log(`All migration versions are correct (v${expectedVersion}).`);
