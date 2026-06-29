// Shared run-level identity: the context every post carries, resolved from the
// CI environment. Suite-agnostic — the caller passes its `test_suite` label
// (the backend computes a per-job one; e2e/fe pass their own), so this stays
// the single definition of how repo/run/job/sha/branch are read.

import type { RunContext } from "./contract.ts";
import { toNumber } from "./util.ts";

/**
 * Resolve the run-level context shared by every test in a post. On PRs the
 * ambient `GITHUB_SHA` is a synthetic merge commit and `GITHUB_BASE_REF` the
 * target, so the workflow sets `COMMIT_SHA`/`TARGET_BRANCH` to the PR's head
 * sha / base ref; we fall back to the ambient vars (push runs, local). The
 * `JOB_ID` is exported by the `resolve-job-id` composite action (null when
 * unresolved — the column is nullable).
 */
export function runContext(testSuite: string): RunContext {
  const env = process.env;
  return {
    repo_id: toNumber(env.REPO_ID ?? env.GITHUB_REPOSITORY_ID),
    run_id: toNumber(env.GITHUB_RUN_ID),
    attempt: toNumber(env.GITHUB_RUN_ATTEMPT),
    job_id: toNumber(env.JOB_ID),
    test_suite: testSuite,
    sha: env.COMMIT_SHA || env.GITHUB_SHA || null,
    target_branch: env.TARGET_BRANCH || env.GITHUB_BASE_REF || null,
  };
}
