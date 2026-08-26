// The normalized shape every adapter produces and every consumer reads.
//
// THE AGREEMENT of the adapter pattern: each suite's normalizer
// (`normalizeBackendJunit` / `normalizeFrontendJunit` / `normalizeCypressFailure`)
// turns its source-specific data into `NormalizedTest[]`, and BOTH downstream
// consumers — `reportTestFailures` (the POST) and, later,
// `checkFailuresAgainstQuarantine` (the gate) — read that exact shape. They MUST
// agree on it: if a test's normalized identity differs between the report path
// and the quarantine path, a failure reported under one name won't match its
// quarantine entry under another. Keeping the shape here, in one place, is what
// prevents that drift.
//
// This mirrors ci-conductor's own contract (server repo `origin/dev`:
// `server/src/webhookTypes.ts` `FailedTestsBody` + `lib/failedTests.ts`
// `resolveTestRow`) — a *superset of mostly-optional* fields, resolved
// server-side per-test → body → column default. So each adapter emits only what
// it truthfully observes (the backend has no per-attempt data; it leaves
// `attempts` absent) and the server fills the rest.
//
// NOTE: runtime validation (zod/valibot) is a deliberate, close follow-up. For
// now the shape is enforced by these types only.

/**
 * One reportable test. The backend (JUnit) normalizer only ever emits
 * `name`/`path`/`file`/`message`/`stack`/`status`; the richer fields
 * (`duration`/`attempts`/`failure_screenshot`) exist for the e2e and fe
 * normalizers that land in later rounds. Field names match the wire contract
 * consumed by ci-conductor's `ingestFailedTests` (`path` → test_path, `file` →
 * file_path, `stack` → stack_trace).
 */
export type NormalizedTest = {
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
 * environment (see `resolveRunContext` in `transport.ts`). `test_suite` is the
 * per-job identity discriminator. `repo_id`/`run_id`/`job_id` are GitHub
 * *numeric* IDs (FKs in ci-conductor), null when unresolved (all nullable
 * server-side).
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
  tests: NormalizedTest[];
};
