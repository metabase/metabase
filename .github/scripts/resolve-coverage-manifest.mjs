/**
 * Resolves the nightly e2e coverage manifest closest to a commit's point in
 * history, so the test planner can narrow the e2e run.
 *
 * The whole flow lives here so callers "just get a manifest": list the retained
 * manifest artifacts, find the one whose nightly commit is the nearest ancestor
 * of `headSha` (via the GitHub compare API — no deep clone), download and unzip
 * just that one, and return its parsed contents.
 *
 * `github` is an authenticated Octokit, as injected by actions/github-script.
 * Returns { builtAt, specs, path, behindBy } or null when nothing is an
 * ancestor (caller then runs e2e in full). Never throws: any API/IO failure is
 * logged and resolves to null, because coverage resolution must not break the
 * test plan.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";

const ARTIFACT_NAME = "spec-file-manifest";
const EXTRACT_DIR = "e2e/coverage";
const MANIFEST_PATH = `${EXTRACT_DIR}/${ARTIFACT_NAME}.json`;

export async function resolveCoverageManifest({
  github,
  owner,
  repo,
  headSha,
  log = console.log,
}) {
  try {
    // Every retained manifest artifact, newest first. Each carries its
    // nightly's head_sha — the commit it was built from (== builtAt).
    const artifacts = await github.paginate(
      github.rest.actions.listArtifactsForRepo,
      { owner, repo, name: ARTIFACT_NAME, per_page: 100 },
    );
    const candidates = artifacts
      .filter((artifact) => !artifact.expired && artifact.workflow_run?.head_sha)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

    // First candidate that is an ancestor of head is the closest in history
    // (master is linear, candidates are chronological). compare base...head:
    // behind_by === 0 ⇒ base is an ancestor of head; ahead_by is the distance.
    let chosen = null;
    for (const artifact of candidates) {
      const base = artifact.workflow_run.head_sha;
      // A stale candidate (force-pushed/GC'd commit) makes compare 404 — skip
      // it rather than lose the optimization for everyone.
      let comparison;
      try {
        ({ data: comparison } =
          await github.rest.repos.compareCommitsWithBasehead({
            owner,
            repo,
            basehead: `${base}...${headSha}`,
          }));
      } catch {
        continue;
      }
      if (comparison.behind_by === 0) {
        chosen = { artifact, base, behindBy: comparison.ahead_by };
        break;
      }
    }

    if (!chosen) {
      log("No ancestor coverage manifest found; e2e will run in full.");
      return null;
    }

    const download = await github.rest.actions.downloadArtifact({
      owner,
      repo,
      artifact_id: chosen.artifact.id,
      archive_format: "zip",
    });
    fs.writeFileSync(`${ARTIFACT_NAME}.zip`, Buffer.from(download.data));
    execFileSync("unzip", ["-o", `${ARTIFACT_NAME}.zip`, "-d", EXTRACT_DIR]);

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    log(
      `Using coverage manifest ${chosen.base.slice(0, 12)} ` +
        `(${chosen.behindBy} commits behind HEAD).`,
    );
    return { ...manifest, path: MANIFEST_PATH, behindBy: chosen.behindBy };
  } catch (error) {
    log(`Coverage manifest resolution failed; e2e will run in full: ${error}`);
    return null;
  }
}
