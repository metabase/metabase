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
  name = ARTIFACT_NAME,
  extractDir = EXTRACT_DIR,
  manifestPath = MANIFEST_PATH,
}) {
  try {
    // Every retained manifest artifact, newest first. Each carries its
    // nightly's head_sha — the commit it was built from (== builtAt). Paginate
    // so an old PR's only ancestor isn't missed past a single-page cap.
    const artifacts = await github.paginate(
      github.rest.actions.listArtifactsForRepo,
      { owner, repo, name, per_page: 100 },
    );
    const candidates = artifacts
      .filter((a) => !a.expired && a.workflow_run?.head_sha)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // First candidate that is an ancestor of head is the closest in history
    // (master is linear, candidates are chronological). compare base...head:
    // behind_by === 0 ⇒ base is an ancestor of head; ahead_by is the distance.
    let chosen = null;
    for (const art of candidates) {
      const base = art.workflow_run.head_sha;
      // A stale candidate (force-pushed/GC'd commit) makes compare 404 — skip
      // it rather than lose the optimization for everyone.
      let cmp;
      try {
        ({ data: cmp } = await github.rest.repos.compareCommitsWithBasehead({
          owner,
          repo,
          basehead: `${base}...${headSha}`,
        }));
      } catch {
        continue;
      }
      if (cmp.behind_by === 0) {
        chosen = { art, base, behindBy: cmp.ahead_by };
        break;
      }
    }

    if (!chosen) {
      log("No ancestor coverage manifest found; e2e will run in full.");
      return null;
    }

    const dl = await github.rest.actions.downloadArtifact({
      owner,
      repo,
      artifact_id: chosen.art.id,
      archive_format: "zip",
    });
    fs.writeFileSync(`${name}.zip`, Buffer.from(dl.data));
    execFileSync("unzip", ["-o", `${name}.zip`, "-d", extractDir]);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    log(
      `Using coverage manifest ${chosen.base.slice(0, 12)} ` +
        `(${chosen.behindBy} commits behind HEAD).`,
    );
    return { ...manifest, path: manifestPath, behindBy: chosen.behindBy };
  } catch (error) {
    log(`Coverage manifest resolution failed; e2e will run in full: ${error}`);
    return null;
  }
}
