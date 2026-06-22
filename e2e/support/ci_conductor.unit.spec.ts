import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractFailedTests, resolveScreenshotPath } from "./ci_conductor";

// jest.mock is hoisted; the mocked default must be referenced via a `mock`-
// prefixed variable. node-fetch is unused by extractFailedTests, so mocking it
// here is harmless for those tests.
const mockFetch = jest.fn();
jest.mock("node-fetch", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockFetch(...args),
}));

// ci_conductor reads some env at import time (top-level destructure) and some
// at call time (e.g. CYPRESS_RETRIES), so loadConductor applies the env BEFORE
// re-importing and leaves it applied until afterEach restores it.
const envBackups: Array<{ key: string; previous: string | undefined }> = [];

afterEach(() => {
  while (envBackups.length) {
    const { key, previous } = envBackups.pop()!;
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
});

const loadConductor = async (env: Record<string, string | undefined>) => {
  jest.resetModules();
  for (const [key, value] of Object.entries(env)) {
    envBackups.push({ key, previous: process.env[key] });
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return await import("./ci_conductor");
};

// Minimal builders for the bits of Cypress' after:spec payload we read.
const spec = {
  name: "foo.cy.spec.ts",
  relative: "e2e/test/scenarios/foo/foo.cy.spec.ts",
} as Cypress.Spec;

const makeResults = (
  overrides: Partial<CypressCommandLine.RunResult>,
): CypressCommandLine.RunResult =>
  ({
    error: null,
    tests: [],
    stats: { failures: 0 },
    ...overrides,
  }) as unknown as CypressCommandLine.RunResult;

// Builds a TestResult-shaped object. The final `state` is derived from
// `attemptStates` so callers can describe healthy/flaky/broken naturally.
const test = (
  title: string[],
  attemptStates: string[],
  displayError: string | null = null,
  duration: number = 100,
) => ({
  title,
  state: attemptStates[attemptStates.length - 1],
  displayError,
  duration,
  attempts: attemptStates.map((state) => ({ state })),
});

// Build a `results.screenshots`-shaped array from bare paths (the only field we
// read). Cypress leaves `name` null for automatic failure shots.
const screenshotsFromPaths = (...paths: string[]) =>
  paths.map((path) => ({
    path,
  })) as unknown as CypressCommandLine.RunResult["screenshots"];

describe("extractFailedTests", () => {
  // Pin the default to "first attempt" so these tests are deterministic even
  // when the CI job running them is itself a re-run (GITHUB_RUN_ATTEMPT > 1).
  // The global afterEach restores the original via envBackups. Re-run cases
  // override process.env.GITHUB_RUN_ATTEMPT in the test body.
  beforeEach(() => {
    envBackups.push({
      key: "GITHUB_RUN_ATTEMPT",
      previous: process.env.GITHUB_RUN_ATTEMPT,
    });
    delete process.env.GITHUB_RUN_ATTEMPT;
  });

  it("reports broken tests with the full displayError as message", () => {
    const displayError =
      "AssertionError: expected true to be false\n    at Context.eval (foo.cy.spec.ts:42)";

    const results = makeResults({
      tests: [
        test(["Dashboard", "filters", "applies a filter"], ["passed"]),
        test(
          ["Dashboard", "filters", "shows an error"],
          ["failed", "failed"],
          displayError,
        ),
      ],
    });

    expect(extractFailedTests(spec, results)).toEqual([
      {
        name: "shows an error",
        path: "Dashboard > filters",
        file: "e2e/test/scenarios/foo/foo.cy.spec.ts",
        duration: 100,
        attempts: [{ state: "failed" }, { state: "failed" }],
        status: "failure",
        message: displayError,
      },
    ]);
  });

  it("includes flaky tests too (final passed but ≥1 failed attempt), with null message", () => {
    const results = makeResults({
      tests: [
        test(["a", "healthy"], ["passed"]),
        test(["a", "flaky"], ["failed", "passed"]),
      ],
    });

    const failures = extractFailedTests(spec, results);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      name: "flaky",
      attempts: [{ state: "failed" }, { state: "passed" }],
      status: "flake",
      message: null,
    });
  });

  it("excludes healthy, pending, and skipped tests", () => {
    const results = makeResults({
      tests: [
        test(["a", "passed test"], ["passed"]),
        test(["a", "pending test"], ["pending"]),
        test(["a", "skipped test"], ["skipped"]),
      ],
    });

    expect(extractFailedTests(spec, results)).toEqual([]);
  });

  it("returns an empty array when nothing has a failed attempt", () => {
    expect(extractFailedTests(spec, makeResults({}))).toEqual([]);
  });

  it("omits `path` for a top-level test with no suite", () => {
    const results = makeResults({
      tests: [test(["lonely test"], ["failed"], "boom")],
    });

    const [failure] = extractFailedTests(spec, results);
    expect(failure).toMatchObject({ name: "lonely test", status: "failure" });
    expect(failure.path).toBeUndefined();
  });

  it("sends message: null when a failed test has no displayError", () => {
    const results = makeResults({
      tests: [test(["a", "no error string"], ["failed"], null)],
    });

    expect(extractFailedTests(spec, results)[0]).toMatchObject({
      name: "no error string",
      path: "a",
      message: null,
    });
  });

  it("falls back to a synthetic entry when the spec crashes before any test runs", () => {
    const results = makeResults({
      error: "SyntaxError: Unexpected token\n  at compile",
      tests: [],
    });

    expect(extractFailedTests(spec, results)).toEqual([
      {
        name: "foo.cy.spec.ts",
        file: "e2e/test/scenarios/foo/foo.cy.spec.ts",
        attempts: [{ state: "failed" }],
        status: "failure",
        message: "SyntaxError: Unexpected token\n  at compile",
      },
    ]);
  });

  it("prefers real failed tests over the spec-level error fallback", () => {
    const results = makeResults({
      error: "some run-level error",
      tests: [test(["a", "real failure"], ["failed"], "boom")],
    });

    const failures = extractFailedTests(spec, results);
    expect(failures).toHaveLength(1);
    expect(failures[0].name).toBe("real failure");
  });

  it("tolerates a missing tests array", () => {
    expect(extractFailedTests(spec, makeResults({ tests: undefined }))).toEqual(
      [],
    );
  });

  it("does not report passing tests on the first attempt", () => {
    process.env.GITHUB_RUN_ATTEMPT = "1";
    const results = makeResults({
      tests: [test(["a", "passing"], ["passed"])],
    });

    expect(extractFailedTests(spec, results)).toEqual([]);
  });

  it("on a re-run (attempt > 1) also reports passing tests with status passed", () => {
    process.env.GITHUB_RUN_ATTEMPT = "2";
    const results = makeResults({
      tests: [
        test(["a", "now passing"], ["passed"]),
        test(["a", "still broken"], ["failed", "failed"], "boom"),
      ],
    });

    const reported = extractFailedTests(spec, results);
    expect(reported).toHaveLength(2);
    expect(reported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "now passing",
          status: "passed",
          message: null,
        }),
        expect.objectContaining({ name: "still broken", status: "failure" }),
      ]),
    );
  });

  it("still excludes pending and skipped tests on a re-run", () => {
    process.env.GITHUB_RUN_ATTEMPT = "3";
    const results = makeResults({
      tests: [
        test(["a", "pending test"], ["pending"]),
        test(["a", "skipped test"], ["skipped"]),
      ],
    });

    expect(extractFailedTests(spec, results)).toEqual([]);
  });

  it("attaches screenshotPath for a failed test with a matching screenshot", () => {
    const path =
      "/cy/screenshots/foo.cy.spec.js/a -- shows an error (failed).png";
    const results = makeResults({
      tests: [test(["a", "shows an error"], ["failed"], "boom")],
      screenshots: screenshotsFromPaths(path),
    });

    expect(extractFailedTests(spec, results)[0]).toMatchObject({
      name: "shows an error",
      screenshotPath: path,
    });
  });

  it("omits screenshotPath when no screenshot matches the test", () => {
    const unrelated =
      "/cy/screenshots/foo/a -- a totally different test (failed).png";
    const results = makeResults({
      tests: [test(["a", "shows an error"], ["failed"], "boom")],
      screenshots: screenshotsFromPaths(unrelated),
    });

    expect(extractFailedTests(spec, results)[0]).not.toHaveProperty(
      "screenshotPath",
    );
  });

  it("omits screenshotPath when the spec produced no screenshots", () => {
    const results = makeResults({
      tests: [test(["a", "shows an error"], ["failed"], "boom")],
    });

    expect(extractFailedTests(spec, results)[0]).not.toHaveProperty(
      "screenshotPath",
    );
  });
});

describe("resolveScreenshotPath", () => {
  const shots = (...paths: string[]) => paths.map((path) => ({ path }));

  it("returns undefined with no screenshots, no title, or no match", () => {
    expect(resolveScreenshotPath(["a", "b"], undefined)).toBeUndefined();
    expect(resolveScreenshotPath(["a", "b"], [])).toBeUndefined();
    expect(
      resolveScreenshotPath(undefined, shots("/x/a (failed).png")),
    ).toBeUndefined();
    expect(
      resolveScreenshotPath(["a", "b"], shots("/x/unrelated (failed).png")),
    ).toBeUndefined();
  });

  it("matches the real on-disk basename despite spaces, ` -- ` and `>` stripping", () => {
    // Verbatim from a local run: describe("scenarios > models > create") →
    // Cypress writes "scenarios  models  create -- <test> (failed).png".
    const path =
      "/home/dev/code/metabase/cypress/screenshots/create.cy.spec.js/scenarios  models  create -- user without a collection access should still be able to create and save a model in his own personal collection (failed).png";
    expect(
      resolveScreenshotPath(
        [
          "scenarios > models > create",
          "user without a collection access should still be able to create and save a model in his own personal collection",
        ],
        shots(path),
      ),
    ).toBe(path);
  });

  it("excludes manual screenshots (no `(failed)` anchor)", () => {
    // A manual cy.screenshot() is named "<title>.png" — no "(failed)".
    const manual = "/x/a -- renders the chart.png";
    expect(
      resolveScreenshotPath(["a", "renders the chart"], shots(manual)),
    ).toBeUndefined();
  });

  it("picks the first attempt over its retry", () => {
    const first = "/x/a -- flaky (failed).png";
    const retry = "/x/a -- flaky (failed) (attempt 2).png";
    expect(resolveScreenshotPath(["a", "flaky"], shots(retry, first))).toBe(
      first,
    );
  });

  it("anchors on `(failed)`, so a prefix title can't steal a longer test's shot", () => {
    const shortShot = "/x/a -- loads (failed).png";
    const longShot = "/x/a -- loads quickly (failed).png";
    // "loads" anchors on "loadsfailed"; "loadsquickly…" can't match it.
    expect(
      resolveScreenshotPath(["a", "loads"], shots(longShot, shortShot)),
    ).toBe(shortShot);
    expect(
      resolveScreenshotPath(["a", "loads quickly"], shots(longShot, shortShot)),
    ).toBe(longShot);
  });
});

describe("reportFailedTestsToConductor", () => {
  const url = "https://conductor.example";
  const endpoint = "https://conductor.example/webhooks/failed-tests";
  const oneTest = [{ name: "a test", file: "foo.cy.spec.ts" }];

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
  });

  it("no-ops when the base URL is not configured", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: undefined,
    });

    await reportFailedTestsToConductor(oneTest);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no-ops when there are no failures to report", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
    });

    await reportFailedTestsToConductor([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POSTs the failures with parsed numeric ids and forwarded tests", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
      REPO_ID: "123",
      GITHUB_RUN_ID: "456",
      GITHUB_RUN_ATTEMPT: "2",
      CYPRESS_RETRIES: "1",
      COMMIT_SHA: "abc123",
      TARGET_BRANCH: "master",
    });

    await reportFailedTestsToConductor(oneTest);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe(endpoint);
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      "Content-Type": "application/json",
    });
    expect(JSON.parse(options.body)).toEqual({
      repo_id: 123,
      run_id: 456,
      attempt: 2,
      job_id: null,
      test_suite: "e2e",
      sha: "abc123",
      target_branch: "master",
      retries: 1,
      tests: oneTest,
    });
  });

  it("prefers COMMIT_SHA/TARGET_BRANCH but falls back to the ambient GITHUB_* vars", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
      COMMIT_SHA: undefined,
      GITHUB_SHA: "ambient-sha",
      TARGET_BRANCH: undefined,
      GITHUB_BASE_REF: "ambient-branch",
    });

    await reportFailedTestsToConductor(oneTest);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sha).toBe("ambient-sha");
    expect(body.target_branch).toBe("ambient-branch");
  });

  it("sends null attempt, sha, target_branch, and retries when their envs are missing", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
      GITHUB_RUN_ATTEMPT: undefined,
      CYPRESS_RETRIES: undefined,
      COMMIT_SHA: undefined,
      GITHUB_SHA: undefined,
      TARGET_BRANCH: undefined,
      GITHUB_BASE_REF: undefined,
    });

    await reportFailedTestsToConductor(oneTest);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.attempt).toBeNull();
    expect(body.retries).toBeNull();
    expect(body.sha).toBeNull();
    expect(body.target_branch).toBeNull();
  });

  it("sends the x-internal-secret header when the secret is configured", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
      CI_CONDUCTOR_WEBHOOK_SECRET: "s3cr3t",
    });

    await reportFailedTestsToConductor(oneTest);

    expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
      "x-internal-secret": "s3cr3t",
    });
  });

  it("omits the secret header when no secret is configured", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
      CI_CONDUCTOR_WEBHOOK_SECRET: undefined,
    });

    await reportFailedTestsToConductor(oneTest);

    expect(mockFetch.mock.calls[0][1].headers).not.toHaveProperty(
      "x-internal-secret",
    );
  });

  it("appends the endpoint regardless of a trailing slash on the base URL", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: `${url}/`,
    });

    await reportFailedTestsToConductor(oneTest);
    expect(mockFetch.mock.calls[0][0]).toBe(endpoint);
  });

  it("uses JOB_ID env when set (populated by the resolve-job-id action)", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
      JOB_ID: "789",
    });

    await reportFailedTestsToConductor(oneTest);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).job_id).toBe(789);
  });

  it("sends a null job_id when JOB_ID is missing or non-numeric", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
      JOB_ID: "not-a-number",
    });

    await reportFailedTestsToConductor(oneTest);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).job_id).toBeNull();
  });

  it("sends null ids when the env vars are missing or non-numeric", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
      REPO_ID: undefined,
      GITHUB_RUN_ID: "not-a-number",
    });

    await reportFailedTestsToConductor(oneTest);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.repo_id).toBeNull();
    expect(body.run_id).toBeNull();
  });

  it("never throws when the request fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockRejectedValue(new Error("network down"));

    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
    });

    await expect(
      reportFailedTestsToConductor(oneTest),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    (console.error as jest.Mock).mockRestore();
  });

  it("logs the payload and does not POST in dry-run mode", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_DRY_RUN: "true",
      CI_CONDUCTOR_BASE_URL: url,
      REPO_ID: "123",
    });

    await reportFailedTestsToConductor(oneTest);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("dry run"),
      expect.stringContaining('"repo_id":123'),
    );
    logSpy.mockRestore();
  });

  it("logs in dry-run mode even when no base URL is configured", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_DRY_RUN: "true",
      CI_CONDUCTOR_BASE_URL: undefined,
    });

    await reportFailedTestsToConductor(oneTest);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("logs but does not throw on a non-ok response", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
    });

    await reportFailedTestsToConductor(oneTest);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("500"));
    (console.error as jest.Mock).mockRestore();
  });

  it("inlines a resolved screenshot as base64 and drops screenshotPath", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const pathMod = await import("node:path");
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]); // PNG magic
    const file = pathMod.join(os.tmpdir(), "ci-conductor-shot.png");
    fs.writeFileSync(file, bytes);
    try {
      const { reportFailedTestsToConductor } = await loadConductor({
        CI_CONDUCTOR_BASE_URL: url,
      });
      await reportFailedTestsToConductor([
        { name: "t", file: "f.cy.spec.ts", screenshotPath: file },
      ]);
      const sent = JSON.parse(mockFetch.mock.calls[0][1].body).tests[0];
      expect(sent.failure_screenshot).toBe(
        `data:image/png;base64,${bytes.toString("base64")}`,
      );
      expect(sent).not.toHaveProperty("screenshotPath");
    } finally {
      fs.unlinkSync(file);
    }
  });

  it("omits the screenshot (and screenshotPath) when the file can't be read", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
    });

    await reportFailedTestsToConductor([
      { name: "t", file: "f.cy.spec.ts", screenshotPath: "/no/such/file.png" },
    ]);

    const sent = JSON.parse(mockFetch.mock.calls[0][1].body).tests[0];
    expect(sent).not.toHaveProperty("failure_screenshot");
    expect(sent).not.toHaveProperty("screenshotPath");
    // The read failure is logged (best-effort), not thrown.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to read screenshot"),
      "/no/such/file.png",
      expect.anything(),
    );
    errorSpy.mockRestore();
  });

  it("never throws even when fetch throws synchronously", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockImplementation(() => {
      throw new Error("synchronous boom");
    });

    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_BASE_URL: url,
    });

    await expect(
      reportFailedTestsToConductor(oneTest),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    (console.error as jest.Mock).mockRestore();
  });
});

describe("recordFailedTestsForQuarantine", () => {
  const failuresFile = join(tmpdir(), `q-failures-${process.pid}.jsonl`);

  afterEach(() => {
    if (existsSync(failuresFile)) {
      rmSync(failuresFile);
    }
  });

  // The recorder reads QUARANTINE_FAILURES_FILE at import time, so point it at
  // a temp file by re-importing the module with that env applied.
  const load = () => loadConductor({ QUARANTINE_FAILURES_FILE: failuresFile });

  const readLines = () =>
    readFileSync(failuresFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

  it("records only ultimate failures (not flakes or passes), one per line", async () => {
    const { recordFailedTestsForQuarantine } = await load();

    const results = makeResults({
      tests: [
        test(["scenarios > foo", "passes"], ["passed"]),
        test(["scenarios > foo", "flakes then passes"], ["failed", "passed"]),
        test(["scenarios > foo", "stays broken"], ["failed", "failed"], "boom"),
      ],
    });

    recordFailedTestsForQuarantine(extractFailedTests(spec, results));

    expect(readLines()).toEqual([
      {
        test_name: "stays broken",
        test_path: "scenarios > foo",
        file_path: "e2e/test/scenarios/foo/foo.cy.spec.ts",
      },
    ]);
  });

  it("appends across calls so the whole job's failures accumulate", async () => {
    const { recordFailedTestsForQuarantine } = await load();

    recordFailedTestsForQuarantine(
      extractFailedTests(
        spec,
        makeResults({ tests: [test(["A", "one"], ["failed", "failed"], "x")] }),
      ),
    );
    recordFailedTestsForQuarantine(
      extractFailedTests(
        spec,
        makeResults({ tests: [test(["B", "two"], ["failed", "failed"], "y")] }),
      ),
    );

    expect(readLines().map((t) => t.test_name)).toEqual(["one", "two"]);
  });

  it("writes nothing when there are no ultimate failures", async () => {
    const { recordFailedTestsForQuarantine } = await load();

    recordFailedTestsForQuarantine(
      extractFailedTests(
        spec,
        makeResults({
          tests: [
            test(["A", "ok"], ["passed"]),
            test(["A", "flaky"], ["failed", "passed"]),
          ],
        }),
      ),
    );

    expect(existsSync(failuresFile)).toBe(false);
  });

  it("never throws when the file can't be written", async () => {
    // A NUL byte in the path makes the fs calls throw; the recorder must swallow it.
    const { recordFailedTestsForQuarantine } = await loadConductor({
      QUARANTINE_FAILURES_FILE: "/tmp/\0/nope.jsonl",
    });
    jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      recordFailedTestsForQuarantine([
        {
          name: "n",
          path: "p",
          file: "f",
          status: "failure",
          attempts: [{ state: "failed" }],
        },
      ] as Parameters<typeof recordFailedTestsForQuarantine>[0]),
    ).not.toThrow();

    (console.error as jest.Mock).mockRestore();
  });
});
