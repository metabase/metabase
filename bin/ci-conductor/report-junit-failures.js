// Reports backend (Clojure) test failures to the ci-conductor service by parsing
// the JUnit XML the hawk test runner always writes to `target/junit/`. Runs as a
// post-test step on both the backend and driver CI paths (one runner, one
// artifact). Best-effort and never throws — reporting must not break a test run.
//
// Mirrors the e2e reporter's contract (see e2e/support/ci_conductor.ts), sending
// the same `/webhooks/failed-tests` payload.
//
// Deliberately zero-dependency, plain CommonJS Node: driver/backend CI jobs run
// only `prepare-backend` (JDK + Clojure), so there's no `bun`, no `node_modules`,
// and no `tsx`. We use the runner's preinstalled `node` with built-in `fetch` and
// `fs`, and parse hawk's simple, machine-generated XML ourselves rather than pull
// in a parser we'd have to install. See DEV-2224.

const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const JUNIT_DIR = process.env.JUNIT_DIR || "target/junit";

// The endpoint can be slow, but the reporter must never hang a CI job.
const REQUEST_TIMEOUT_MS = 15_000;

/** Parse a numeric env var, treating missing/blank/non-numeric as null. */
function toNumber(value) {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Decode the XML entities hawk can emit in attribute values. */
function decodeEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Read an attribute off an XML open-tag's attribute string. */
function attr(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return match ? decodeEntities(match[1]) : undefined;
}

/** Unwrap CDATA / decode plain text from a failure/error body. */
function elementBody(inner) {
  const cdata = [...inner.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) =>
    m[1].trim(),
  );
  const text = cdata.length > 0 ? cdata.join("\n") : decodeEntities(inner);
  return text.trim();
}

/**
 * Parse one JUnit XML document into ci-conductor `tests[]` entries — one per
 * `<testcase>` that carries a `<failure>` or `<error>`. Multiple problems in a
 * single testcase are joined into one `stack`. Passing (self-closing or
 * problem-free) testcases are skipped. Never throws.
 */
function parseJunit(xml) {
  try {
    const tests = [];
    // Machine-generated hawk output: <testcase ...>...</testcase> (failing) or
    // <testcase .../> (passing, skipped). classname carries the namespace.
    const testcaseRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    for (const match of xml.matchAll(testcaseRe)) {
      const attrs = match[1];
      const inner = match[2];
      if (!inner) {
        continue; // self-closing => passed
      }

      const problems = [
        ...inner.matchAll(/<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/g),
      ];
      if (problems.length === 0) {
        continue;
      }

      const name = (attr(attrs, "name") || "").trim();
      if (name === "") {
        continue;
      }
      const namespace = (attr(attrs, "classname") || "").trim();

      const stack = problems
        .map((p) => elementBody(p[3]))
        .filter((body) => body !== "")
        .join("\n\n");
      const lines = stack.split("\n").filter((line) => line.trim() !== "");
      // The first line of the failure body (the `file:line` locator); the full
      // trace, including this line, stays in `stack`.
      const attrMessage = problems
        .map((p) => attr(p[2], "message"))
        .find((m) => m != null && m !== "");
      const message = attrMessage ?? lines[0] ?? undefined;

      tests.push({
        name,
        path: namespace || undefined,
        // file_path is unstable for backend tests (the stack locator varies by
        // failure mode), so identity is (test_suite, test_path, test_name) and
        // file_path is sent as null. See DEV-2224.
        file: null,
        message,
        stack: stack || undefined,
        // JUnit only tells us a test failed/errored, never that it recovered, so
        // everything is "failure". Do NOT set a per-test `suite` — it would
        // override the run-level `test_suite` and collapse the per-job identity.
        status: "failure",
      });
    }
    return tests;
  } catch (error) {
    console.error("[ci-conductor] failed to parse JUnit XML", error);
    return [];
  }
}

/** Recursively list `*_test.xml` files under `dir`. Returns [] on any error. */
function findJunitFiles(dir) {
  try {
    return readdirSync(dir, { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith("_test.xml"))
      .map((entry) => join(dir, entry));
  } catch {
    return [];
  }
}

/** Parse every JUnit file under `dir` into ci-conductor `tests[]` entries. */
function collectFailures(dir) {
  return findJunitFiles(dir).flatMap((file) => {
    try {
      return parseJunit(readFileSync(file, "utf8"));
    } catch (error) {
      console.error(`[ci-conductor] failed to read ${file}`, error);
      return [];
    }
  });
}

/**
 * The run-level context shared by every test in a post, resolved from the CI
 * environment. `test_suite` is the per-job identity discriminator: each driver /
 * backend job exports its unique label as `CI_CONDUCTOR_TEST_SUITE` (e.g.
 * `driver-postgres-ee`, `be-tests-java-21-ee`) so the same namespace/var run on
 * different drivers or legs stays distinct in conductor's identity key
 * (test_name, test_path, file_path, sha, test_suite). Falls back to the driver
 * keyword, then a generic `backend`.
 */
function runContext() {
  const env = process.env;
  const testSuite =
    env.CI_CONDUCTOR_TEST_SUITE ||
    (env.DRIVERS ? `driver-${env.DRIVERS}` : "backend");
  return {
    repo_id: toNumber(env.REPO_ID || env.GITHUB_REPOSITORY_ID),
    run_id: toNumber(env.GITHUB_RUN_ID),
    attempt: toNumber(env.GITHUB_RUN_ATTEMPT),
    // resolve-job-id exports JOB_ID; null when unresolved (column is nullable).
    job_id: toNumber(env.JOB_ID),
    test_suite: testSuite,
    // On PRs the ambient GITHUB_SHA is a synthetic merge commit and
    // GITHUB_BASE_REF the target, so the workflow sets COMMIT_SHA/TARGET_BRANCH
    // to the PR's head sha / base ref; fall back to the ambient vars otherwise.
    sha: env.COMMIT_SHA || env.GITHUB_SHA || null,
    target_branch: env.TARGET_BRANCH || env.GITHUB_BASE_REF || null,
  };
}

/**
 * Report the given failures to ci-conductor by POSTing them to the webhook,
 * no-opping when the webhook URL isn't configured (local runs, PRs without the
 * secret). Never throws — reporting must not break a test run.
 */
async function postFailedTests(tests) {
  const baseUrl = process.env.CI_CONDUCTOR_BASE_URL;
  if (tests.length === 0 || !baseUrl) {
    return;
  }

  try {
    const body = { ...runContext(), tests };

    const endpoint = `${baseUrl.replace(/\/+$/, "")}/webhooks/failed-tests`;
    const headers = { "Content-Type": "application/json" };
    if (process.env.CI_CONDUCTOR_WEBHOOK_SECRET) {
      // ci-conductor authenticates this endpoint via the x-internal-secret header.
      headers["x-internal-secret"] = process.env.CI_CONDUCTOR_WEBHOOK_SECRET;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(
        `[ci-conductor] failed-tests POST returned ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error("[ci-conductor] failed to POST failed-tests", error);
  }
}

async function main() {
  await postFailedTests(collectFailures(JUNIT_DIR));
}

// Only run when invoked directly (`node report-junit-failures.js`), not when
// required by the unit test.
if (require.main === module) {
  main().catch((error) => {
    // Last line of defense: reporting must never fail the job.
    console.error(
      "[ci-conductor] driver/backend reporting failed (ignored)",
      error,
    );
  });
}

module.exports = { parseJunit, collectFailures, postFailedTests };
