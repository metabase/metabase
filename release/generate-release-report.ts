// Generate a self-contained HTML release report for a newly-cut major release
// branch. Traces every commit back to the previous major's fork point, resolves
// the linked GitHub issues and Linear projects, previews the release notes, and
// asks the `claude` CLI for a "major themes" summary.
//
//   cd release && bun run generate-release-report 63
//
// Requires GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO and LINEAR_API_KEY in the
// environment (the repo .env at the project root already has LINEAR_API_KEY).
// The release-x.<major>.x and master branches must be fetched locally.

import fs from "fs";

import { $ } from "zx";
import { Octokit } from "@octokit/rest";

import { generateThemeSummary } from "./src/ai-summary";
import { getReleaseReportData } from "./src/release-report";
import { renderReleaseReportHtml } from "./src/release-report-html";

const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, LINEAR_API_KEY } = process.env as Record<
  string,
  string | undefined
>;

const majorVersion = Number(process.argv[2]);

if (!Number.isInteger(majorVersion) || majorVersion <= 0) {
  console.error("Usage: bun run generate-release-report <major-version>   (e.g. 63)");
  process.exit(1);
}

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error("Missing GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO in the environment.");
  process.exit(1);
}

if (!LINEAR_API_KEY) {
  console.error("Missing LINEAR_API_KEY in the environment (needed to resolve Linear projects).");
  process.exit(1);
}

const github = new Octokit({ auth: GITHUB_TOKEN });

// Make sure the branches we diff exist locally and are current.
$.verbose = false;
try {
  console.log(`Fetching origin/release-x.${majorVersion}.x, origin/release-x.${majorVersion - 1}.x, master…`);
  await $`git fetch origin release-x.${majorVersion}.x release-x.${majorVersion - 1}.x master`;
} catch {
  console.warn("git fetch failed (offline?); continuing with whatever refs are present locally.");
}

const data = await getReleaseReportData({
  github,
  owner: GITHUB_OWNER,
  repo: GITHUB_REPO,
  majorVersion,
  linearApiKey: LINEAR_API_KEY,
});

console.log("Generating theme summary via the claude CLI…");
const summaryMarkdown = await generateThemeSummary({
  version: data.version,
  issueCount: data.issues.length,
  linearIssueCount: data.linearIssueCount,
  projects: data.projects,
  notesMarkdown: data.releaseNotesMarkdown,
});

const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const html = renderReleaseReportHtml({ data, summaryMarkdown, generatedAt });

const outFile = `release-report-v${majorVersion}.html`;
fs.writeFileSync(outFile, html);

console.log(`\n✅ Wrote ${outFile}`);
console.log(
  `   ${data.issues.length} issues · ${data.prCount} PRs · ${data.linearIssueCount} Linear issues · ${
    data.projects.filter(p => p.project !== null).length
  } projects`,
);
