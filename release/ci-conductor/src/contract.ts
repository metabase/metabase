// The canonical payload POSTed to ci-conductor's `/webhooks/failed-tests`.
//
// THE HUB of the adapter pattern: every suite adapter (junit/jest/cypress) must
// produce `CanonicalTest[]`, and the shared transport posts a `FailedTestsBody`.
// Keeping the shape in one place is the whole point — three sources, one wire
// format, so nothing drifts.
//
// This mirrors ci-conductor's own contract (server repo `origin/dev`:
// `server/src/webhookTypes.ts` `FailedTestsBody` + `lib/failedTests.ts`
// `resolveTestRow`). That contract is a *superset of mostly-optional* fields,
// resolved server-side per-test → body → column default. So each adapter emits
// only what it truthfully observes (the backend has no per-attempt data; it
// simply leaves `attempts` absent) and the server fills the rest.
//
// NOTE: runtime validation (zod/valibot) is a deliberate, close follow-up. For
// now the contract is enforced by these types only.

/**
 * One reportable test. The backend (JUnit) adapter only ever emits
 * `name`/`path`/`file`/`message`/`stack`/`status`; the richer fields
 * (`duration`/`attempts`/`failure_screenshot`) exist for the e2e and fe
 * adapters that land in later rounds. Field names match the wire contract
 * consumed by ci-conductor's `ingestFailedTests` (`path` → test_path, `file` →
 * file_path, `stack` → stack_trace).
 */
export type CanonicalTest = {
  name: string;
  /** Joined suite/`describe` path. Maps to the server's `test_path`. */
  path?: string | null;
  /** Source file. Maps to the server's `file_path`. */
  file?: string | null;
  message?: string | null;
  stack?: string | null;
  /** Defaults to "failure" server-side when absent. */
  status?: "failure" | "flake" | "passed";
  duration?: number;
  /** Raw per-attempt states, e.g. `[{state:"failed"},{state:"passed"}]`. */
  attempts?: { state: string }[];
  /** Base64 PNG data URI; ci-conductor uploads it and stores the URL. */
  failure_screenshot?: string;
};

/**
 * Run-level context shared by every test in a post, resolved once from the CI
 * environment (see `identity.ts`). `test_suite` is the per-job identity
 * discriminator. `repo_id`/`run_id`/`job_id` are GitHub *numeric* IDs (FKs in
 * ci-conductor), null when unresolved (all nullable server-side).
 */
export type RunContext = {
  repo_id: number | null;
  run_id: number | null;
  job_id: number | null;
  attempt: number | null;
  test_suite: string;
  sha: string | null;
  target_branch: string | null;
};

/** The full request body: run-level context plus the batch of tests. */
export type FailedTestsBody = RunContext & {
  tests: CanonicalTest[];
};
