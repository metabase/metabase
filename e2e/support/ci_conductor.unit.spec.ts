import { extractFailedTests } from "./ci_conductor";

// jest.mock is hoisted; the mocked default must be referenced via a `mock`-
// prefixed variable. node-fetch is unused by extractFailedTests, so mocking it
// here is harmless for those tests.
const mockFetch = jest.fn();
jest.mock("node-fetch", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockFetch(...args),
}));

// ci_conductor reads its env vars once at import time, so each send-path test
// re-imports the module with a fresh process.env.
const loadConductor = async (env: Record<string, string | undefined>) => {
  jest.resetModules();
  const original = process.env;
  process.env = { ...original, ...env };
  try {
    return await import("./ci_conductor");
  } finally {
    process.env = original;
  }
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

const test = (
  title: string[],
  state: string,
  displayError: string | null = null,
) => ({ title, state, displayError });

describe("extractFailedTests", () => {
  it("reports only failed tests, mapping suite/leaf/message/stack/file", () => {
    const displayError =
      "AssertionError: expected true to be false\n    at Context.eval (foo.cy.spec.ts:42)";

    const results = makeResults({
      stats: { failures: 1 } as CypressCommandLine.RunResult["stats"],
      tests: [
        test(["Dashboard", "filters", "applies a filter"], "passed"),
        test(
          ["Dashboard", "filters", "shows an error"],
          "failed",
          displayError,
        ),
      ],
    });

    expect(extractFailedTests(spec, results)).toEqual([
      {
        name: "shows an error",
        class: "Dashboard > filters",
        file: "e2e/test/scenarios/foo/foo.cy.spec.ts",
        message: "AssertionError: expected true to be false",
        stack: displayError,
      },
    ]);
  });

  it("excludes passed, pending, and skipped tests (incl. flaky-but-passed)", () => {
    const results = makeResults({
      tests: [
        test(["a", "passed test"], "passed"),
        test(["a", "pending test"], "pending"),
        test(["a", "skipped test"], "skipped"),
        // a test that flaked then passed on retry has a final state of "passed"
        test(["a", "flaky test"], "passed"),
      ],
    });

    expect(extractFailedTests(spec, results)).toEqual([]);
  });

  it("returns an empty array when nothing failed", () => {
    expect(extractFailedTests(spec, makeResults({}))).toEqual([]);
  });

  it("omits `class` for a top-level test with no suite", () => {
    const results = makeResults({
      tests: [test(["lonely test"], "failed", "boom")],
    });

    const [failure] = extractFailedTests(spec, results);
    expect(failure).toMatchObject({ name: "lonely test" });
    expect(failure.class).toBeUndefined();
  });

  it("leaves message/stack undefined when a failed test has no displayError", () => {
    const results = makeResults({
      tests: [test(["a", "no error string"], "failed", null)],
    });

    expect(extractFailedTests(spec, results)).toEqual([
      {
        name: "no error string",
        class: "a",
        file: "e2e/test/scenarios/foo/foo.cy.spec.ts",
        message: undefined,
        stack: undefined,
      },
    ]);
  });

  it("skips blank leading lines when deriving the message", () => {
    const results = makeResults({
      tests: [test(["a", "t"], "failed", "\n   \nReal message\nstack line")],
    });

    expect(extractFailedTests(spec, results)[0].message).toBe("Real message");
  });

  it("falls back to a synthetic entry when the spec crashes before any test runs", () => {
    const results = makeResults({
      error: "SyntaxError: Unexpected token\n  at compile",
      stats: { failures: 1 } as CypressCommandLine.RunResult["stats"],
      tests: [],
    });

    expect(extractFailedTests(spec, results)).toEqual([
      {
        name: "foo.cy.spec.ts",
        file: "e2e/test/scenarios/foo/foo.cy.spec.ts",
        message: "SyntaxError: Unexpected token",
        stack: "SyntaxError: Unexpected token\n  at compile",
      },
    ]);
  });

  it("prefers real failed tests over the spec-level error fallback", () => {
    const results = makeResults({
      error: "some run-level error",
      tests: [test(["a", "real failure"], "failed", "boom")],
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
});

describe("reportFailedTestsToConductor", () => {
  const url = "https://conductor.example/webhooks";
  const endpoint = "https://conductor.example/webhooks/failed-tests";
  const oneTest = [{ name: "a test", file: "foo.cy.spec.ts" }];

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
  });

  it("no-ops when the webhook URL is not configured", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_WEBHOOK_URL: undefined,
    });

    await reportFailedTestsToConductor(oneTest);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no-ops when there are no failures to report", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_WEBHOOK_URL: url,
    });

    await reportFailedTestsToConductor([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POSTs the failures with parsed numeric ids and a null job_id", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_WEBHOOK_URL: url,
      REPO_ID: "123",
      GITHUB_RUN_ID: "456",
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
      job_id: null,
      tests: oneTest,
    });
  });

  it("appends the endpoint regardless of a trailing slash on the base URL", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_WEBHOOK_URL: `${url}/`,
    });

    await reportFailedTestsToConductor(oneTest);
    expect(mockFetch.mock.calls[0][0]).toBe(endpoint);
  });

  it("sends null ids when the env vars are missing or non-numeric", async () => {
    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_WEBHOOK_URL: url,
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
      CI_CONDUCTOR_WEBHOOK_URL: url,
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
      CI_CONDUCTOR_WEBHOOK_URL: url,
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

  it("logs in dry-run mode even when no webhook URL is configured", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_DRY_RUN: "true",
      CI_CONDUCTOR_WEBHOOK_URL: undefined,
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
      CI_CONDUCTOR_WEBHOOK_URL: url,
    });

    await reportFailedTestsToConductor(oneTest);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("500"));
    (console.error as jest.Mock).mockRestore();
  });

  it("never throws even when fetch throws synchronously", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockImplementation(() => {
      throw new Error("synchronous boom");
    });

    const { reportFailedTestsToConductor } = await loadConductor({
      CI_CONDUCTOR_WEBHOOK_URL: url,
    });

    await expect(
      reportFailedTestsToConductor(oneTest),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    (console.error as jest.Mock).mockRestore();
  });
});
