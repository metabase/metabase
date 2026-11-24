import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

import type { NormalizedTest } from "./contract.ts";
import * as retry from "./fetchWithRetry.ts";
import {
  type FailedTest,
  type GateResult,
  type QuarantineEntry,
  checkQuarantineGate,
  compareFailedToQuarantine,
  fetchQuarantine,
  junitFailuresToFailedTests,
  matchKey,
  quarantinedSuiteGlob,
  suiteMatchesGlob,
  testSearchUrl,
} from "./quarantine.ts";

const failed = (
  test_name: string,
  test_path: string | null = "Suite",
  file_path: string | null = "e2e/test/foo.cy.spec.ts",
): FailedTest => ({ test_name, test_path, file_path });

const quarantined = (
  test_name: string,
  test_path = "Suite",
  file_path = "e2e/test/foo.cy.spec.ts",
  permalink = `https://conductor.example.com/tests/${test_name}`,
): QuarantineEntry => ({
  test_name,
  test_path,
  file_path,
  permalink,
  test_suite: "e2e",
});

describe("compareFailedToQuarantine", () => {
  it("puts every failure in `unquarantined` when nothing is quarantined", () => {
    const failures = [failed("a"), failed("b")];

    const { quarantined: q, unquarantined } = compareFailedToQuarantine(
      failures,
      [],
    );

    expect(q).toEqual([]);
    expect(unquarantined).toEqual(failures);
  });

  it("puts every failure in `quarantined` when all are listed, as list entries", () => {
    const entries = [quarantined("a"), quarantined("b")];

    const { quarantined: q, unquarantined } = compareFailedToQuarantine(
      [failed("a"), failed("b")],
      entries,
    );

    expect(q).toEqual(entries);
    expect(unquarantined).toEqual([]);
  });

  it("partitions a mixed set", () => {
    const b = failed("b");
    const entryA = quarantined("a");
    const entryC = quarantined("c");

    const { quarantined: q, unquarantined } = compareFailedToQuarantine(
      [failed("a"), b, failed("c")],
      [entryA, entryC],
    );

    expect(q).toEqual([entryA, entryC]);
    expect(unquarantined).toEqual([b]);
  });

  it("returns matches in the order the failures came in", () => {
    const entryA = quarantined("a");
    const entryB = quarantined("b");

    const { quarantined: q } = compareFailedToQuarantine(
      [failed("b"), failed("a")],
      [entryA, entryB],
    );

    expect(q).toEqual([entryB, entryA]);
  });

  it("returns two empty buckets for no failures", () => {
    expect(compareFailedToQuarantine([], [quarantined("a")])).toEqual({
      quarantined: [],
      unquarantined: [],
    });
  });

  it("matches on all three fields — same name, different file is not a match", () => {
    const failure = failed("a", "Suite", "e2e/test/foo.cy.spec.ts");

    const { unquarantined } = compareFailedToQuarantine(
      [failure],
      [quarantined("a", "Suite", "e2e/test/bar.cy.spec.ts")],
    );

    expect(unquarantined).toEqual([failure]);
  });

  it("matches on all three fields — same name/file, different describe path is not a match", () => {
    const failure = failed("a", "Suite > inner");

    const { unquarantined } = compareFailedToQuarantine(
      [failure],
      [quarantined("a", "Suite > other")],
    );

    expect(unquarantined).toEqual([failure]);
  });

  it("treats a null path on the failure as an empty string for matching", () => {
    const entry = quarantined("a", "", "");

    const { quarantined: q } = compareFailedToQuarantine(
      [failed("a", null, null)],
      [entry],
    );

    expect(q).toEqual([entry]);
  });
});

describe("matchKey", () => {
  it("normalizes null/undefined paths to empty strings", () => {
    expect(
      matchKey({ filePath: null, testPath: undefined, testName: "a" }),
    ).toBe(matchKey({ filePath: "", testPath: "", testName: "a" }));
  });

  it("does not collide when a boundary between fields shifts", () => {
    // ["a", "b", "c"] vs ["ab", "", "c"] must stay distinct.
    expect(matchKey({ filePath: "a", testPath: "b", testName: "c" })).not.toBe(
      matchKey({ filePath: "ab", testPath: "", testName: "c" }),
    );
  });
});

describe("testSearchUrl", () => {
  const base = "https://conductor.coredev.metabase.com";

  it("searches the full `test_path › test_name` title", () => {
    expect(
      testSearchUrl(
        base,
        failed(
          "should be able to view and revert document revisions",
          "documents › revision history",
        ),
      ),
    ).toBe(
      "https://conductor.coredev.metabase.com/tests?q=should+be+able+to+view+and+revert+document+revisions",
    );
  });

  it("takes a quarantine entry just as happily as a failure", () => {
    expect(testSearchUrl(base, quarantined("a test", "Suite"))).toBe(
      `${base}/tests?q=a+test`,
    );
  });

  it("trims a trailing slash off the base url", () => {
    expect(testSearchUrl(`${base}//`, failed("a test", null))).toBe(
      `${base}/tests?q=a+test`,
    );
  });

  it("escapes characters that would otherwise break out of the query string", () => {
    expect(testSearchUrl(base, failed(`#1 "a" & b`, null))).toBe(
      `${base}/tests?q=%231+%22a%22+%26+b`,
    );
  });
});

describe("junitFailuresToFailedTests", () => {
  it("renames name/path/file to the gate's identity fields", () => {
    const tests: NormalizedTest[] = [
      {
        name: "renders the table",
        path: "metabase.viz-test",
        file: "viz_test.clj",
        status: "failure",
      },
    ];

    expect(junitFailuresToFailedTests(tests)).toEqual([
      {
        test_name: "renders the table",
        test_path: "metabase.viz-test",
        file_path: "viz_test.clj",
      },
    ]);
  });

  it("defaults a missing path/file to null", () => {
    const tests: NormalizedTest[] = [{ name: "a", status: "failure" }];

    expect(junitFailuresToFailedTests(tests)).toEqual([
      { test_name: "a", test_path: null, file_path: null },
    ]);
  });

  it("treats an absent status as a failure (JUnit only emits failures)", () => {
    const tests: NormalizedTest[] = [{ name: "a" }];

    expect(junitFailuresToFailedTests(tests)).toHaveLength(1);
  });

  it("drops a non-failure row defensively", () => {
    const tests: NormalizedTest[] = [
      { name: "broke", status: "failure" },
      { name: "recovered", status: "passed" },
    ];

    expect(junitFailuresToFailedTests(tests)).toEqual([
      { test_name: "broke", test_path: null, file_path: null },
    ]);
  });
});

describe("suiteMatchesGlob", () => {
  it("matches a bare name anywhere in the suite, without wildcards", () => {
    expect(suiteMatchesGlob("be-tests-athena-ee", "athena")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(suiteMatchesGlob("be-tests-athena-ee", "ATHENA")).toBe(true);
  });

  it("expands `*` and `?`", () => {
    expect(suiteMatchesGlob("be-tests-java-21-mbql", "be-tests-*-mbql")).toBe(
      true,
    );
    expect(suiteMatchesGlob("e2e-3", "e2e-?")).toBe(true);
    expect(suiteMatchesGlob("e2e-12", "e2e-?")).toBe(true); // unanchored
  });

  it("expands `{a,b}` alternations", () => {
    expect(suiteMatchesGlob("fe-tests-unit", "{be,fe}-tests")).toBe(true);
    expect(suiteMatchesGlob("e2e", "{be,fe}-tests")).toBe(false);
  });

  it("treats regex metacharacters in the rule as literals", () => {
    expect(suiteMatchesGlob("be-tests-mbql", "be.tests")).toBe(false);
    expect(suiteMatchesGlob("be.tests-mbql", "be.tests")).toBe(true);
  });

  it("never matches on an empty or whitespace-only rule", () => {
    expect(suiteMatchesGlob("e2e", "")).toBe(false);
    expect(suiteMatchesGlob("e2e", "   ")).toBe(false);
  });

  it("compiles an unbalanced brace instead of throwing", () => {
    expect(suiteMatchesGlob("be-tests", "{be,fe")).toBe(true);
  });
});

describe("quarantinedSuiteGlob", () => {
  it("returns the rule that covers the suite", () => {
    expect(quarantinedSuiteGlob("be-tests-athena-ee", ["e2e", "athena"])).toBe(
      "athena",
    );
  });

  it("returns undefined when no rule covers the suite", () => {
    expect(quarantinedSuiteGlob("be-tests-athena-ee", ["e2e"])).toBeUndefined();
    expect(quarantinedSuiteGlob("be-tests-athena-ee", [])).toBeUndefined();
  });
});

describe("fetchQuarantine", () => {
  const originalLog = console.log;
  const originalError = console.error;
  let logged: string[] = [];

  beforeEach(() => {
    logged = [];
    console.log = (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    };
    console.error = () => {};
  });

  afterEach(() => {
    mock.restore();
    console.log = originalLog;
    console.error = originalError;
  });

  function respondWith(outcome: Response | Error) {
    return spyOn(retry, "fetchWithRetry").mockImplementation(async () => {
      if (outcome instanceof Error) {
        throw outcome;
      }
      return outcome;
    });
  }

  type FetchWithRetrySpy = ReturnType<typeof respondWith>;

  function requestOf(spy: FetchWithRetrySpy) {
    const call = spy.mock.calls[0];
    if (!call) {
      throw new Error("fetchWithRetry was not called");
    }
    const [input, init = {}] = call;
    return { input, init };
  }

  function shouldRetryOf(spy: FetchWithRetrySpy) {
    const { shouldRetry } = requestOf(spy).init;
    if (!shouldRetry) {
      throw new Error("fetchQuarantine passed no shouldRetry");
    }
    return shouldRetry;
  }

  const okList = (entries: QuarantineEntry[], suites?: string[]) =>
    new Response(JSON.stringify({ tests: entries, suites }), { status: 200 });
  const status = (code: number) => new Response("", { status: code });

  const list = (entries: QuarantineEntry[], suites: string[] = []) => ({
    tests: entries,
    suites,
  });

  const fetchList = (opts: { secret?: string } = {}) =>
    fetchQuarantine({
      baseUrl: "https://ci-conductor.example",
      suite: "e2e",
      ...opts,
    });

  it("requests the suite's list from /api/quarantine once", async () => {
    const spy = respondWith(okList([]));

    await fetchQuarantine({
      baseUrl: "https://ci-conductor.example//",
      suite: "be tests&more",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(requestOf(spy).input).toBe(
      "https://ci-conductor.example/api/quarantine?suite=be%20tests%26more",
    );
  });

  it("sends the secret header when given a secret", async () => {
    const spy = respondWith(okList([]));

    await fetchList({ secret: "shh" });

    expect(requestOf(spy).init.headers).toEqual({ "x-internal-secret": "shh" });
  });

  it("sends no secret header without a secret", async () => {
    const spy = respondWith(okList([]));

    await fetchList();

    expect(requestOf(spy).init.headers).toEqual({});
  });

  it("asks for 3 attempts, a 500ms backoff base and a 15s timeout", async () => {
    const spy = respondWith(okList([]));

    await fetchList();

    expect(requestOf(spy).init).toMatchObject({
      retries: 2,
      baseDelay: 500,
      timeout: 15_000,
    });
  });

  it("retries a 5xx and a 429", async () => {
    const spy = respondWith(okList([]));
    await fetchList();
    const shouldRetry = shouldRetryOf(spy);

    for (const code of [500, 502, 503, 504, 429]) {
      expect(shouldRetry(status(code))).toBe(true);
    }
  });

  it("does not retry a 4xx — the request itself is wrong — or a success", async () => {
    const spy = respondWith(okList([]));
    await fetchList();
    const shouldRetry = shouldRetryOf(spy);

    for (const code of [200, 400, 401, 403, 404]) {
      expect(shouldRetry(status(code))).toBe(false);
    }
  });

  it("logs each non-ok status it is asked about, and nothing for a success", async () => {
    const spy = respondWith(okList([]));
    await fetchList();
    const shouldRetry = shouldRetryOf(spy);

    shouldRetry(status(200));
    expect(logged).toEqual([]);

    shouldRetry(status(502));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("/api/quarantine?suite=e2e → 502");
    expect(logged[0]).not.toContain("ci-conductor.example");
  });

  it("returns the list", async () => {
    respondWith(okList([quarantined("a")]));

    expect(await fetchList()).toEqual(list([quarantined("a")]));
  });

  it("returns the suite-level rules alongside the tests", async () => {
    respondWith(okList([quarantined("a")], ["athena", "{be,fe}-*"]));

    expect(await fetchList()).toEqual(
      list([quarantined("a")], ["athena", "{be,fe}-*"]),
    );
  });

  it("defaults both keys to empty when the response omits them", async () => {
    respondWith(new Response(JSON.stringify({ count: 0 }), { status: 200 }));

    expect(await fetchList()).toEqual(list([]));
  });

  it("returns null when the final response is not ok", async () => {
    respondWith(status(503));

    expect(await fetchList()).toBeNull();
  });

  it("returns null for a 4xx", async () => {
    respondWith(status(401));

    expect(await fetchList()).toBeNull();
  });

  it("returns null instead of throwing when every attempt failed", async () => {
    respondWith(new Error("The socket connection was closed unexpectedly"));

    expect(await fetchList()).toBeNull();
  });

  it("returns null instead of throwing when the body is not JSON", async () => {
    respondWith(new Response("<html>", { status: 200 }));

    expect(await fetchList()).toBeNull();
  });
});

describe("checkQuarantineGate", () => {
  const failure: FailedTest = {
    test_name: "renders",
    test_path: "Suite",
    file_path: "foo.spec.ts",
  };

  // Capture the gate's log lines so we can assert on the printed verdict.
  async function runCapturingLogs(
    opts: Parameters<typeof checkQuarantineGate>[0],
  ): Promise<{ result: GateResult; verdict: string | undefined }> {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      const result = await checkQuarantineGate(opts);
      return { result, verdict: lines.find((l) => l.includes("VERDICT:")) };
    } finally {
      console.log = original;
    }
  }

  it("fails when the test step failed with no failing tests", async () => {
    const { result, verdict } = await runCapturingLogs({
      suite: "e2e",
      failures: [],
      baseUrl: undefined,
      secret: undefined,
      dryRun: false,
    });
    expect(result).toEqual({
      shouldFail: true,
      enforced: true,
      reason: "the test step failed with no failing tests to check",
    });
    expect(verdict).toContain("VERDICT: FAIL");
  });

  it("reports COULD NOT CHECK — not FAIL — when the base URL is unset", async () => {
    const { result, verdict } = await runCapturingLogs({
      suite: "e2e",
      failures: [failure],
      baseUrl: undefined,
      secret: undefined,
      dryRun: true,
    });
    expect(result.reason).toBe("could not fetch the quarantine list");
    expect(verdict).toContain("COULD NOT CHECK");
    expect(verdict).not.toContain("FAIL");
  });

  it("fails closed but stays unenforced under dry run when it can't check", async () => {
    const { result } = await runCapturingLogs({
      suite: "e2e",
      failures: [failure],
      baseUrl: undefined,
      secret: undefined,
      dryRun: true,
    });
    expect(result.shouldFail).toBe(true);
    expect(result.enforced).toBe(false);
  });

  it("fails the job when the list request fails and there are failures to gate", async () => {
    const originalFetch = globalThis.fetch;
    // A 401 fails on the first attempt, so the gate's retry backoff never sleeps.
    globalThis.fetch = (async () =>
      new Response("", { status: 401 })) as unknown as typeof fetch;
    try {
      const { result, verdict } = await runCapturingLogs({
        suite: "e2e",
        failures: [failure],
        baseUrl: "https://ci-conductor.example",
        secret: "shh",
        dryRun: false,
      });
      expect(result).toEqual({
        shouldFail: true,
        enforced: true,
        reason: "could not fetch the quarantine list",
      });
      expect(verdict).toContain("COULD NOT CHECK");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails closed AND enforces when it can't check outside dry run", async () => {
    const { result } = await runCapturingLogs({
      suite: "e2e",
      failures: [failure],
      baseUrl: undefined,
      secret: undefined,
      dryRun: false,
    });
    expect(result.shouldFail).toBe(true);
    expect(result.enforced).toBe(true);
  });

  /** Serve one `/api/quarantine` body for the duration of `run`. */
  async function withList<T>(
    body: { tests?: QuarantineEntry[]; suites?: string[] },
    run: () => Promise<T>,
  ): Promise<T> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status: 200,
      })) as unknown as typeof fetch;
    try {
      return await run();
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const gate = (suite: string) =>
    runCapturingLogs({
      suite,
      failures: [failure],
      baseUrl: "https://ci-conductor.example",
      secret: "shh",
      dryRun: false,
    });

  it("passes an unquarantined failure when a suite rule covers the suite", async () => {
    const { result, verdict } = await withList(
      { tests: [], suites: ["athena"] },
      () => gate("be-tests-athena-ee"),
    );

    expect(result).toEqual({
      shouldFail: false,
      enforced: false,
      reason: 'suite "be-tests-athena-ee" is quarantined by the rule "athena"',
    });
    expect(verdict).toContain("PASS");
  });

  it("still gates test by test when no suite rule matches", async () => {
    const { result } = await withList({ tests: [], suites: ["athena"] }, () =>
      gate("fe-tests-unit"),
    );

    expect(result).toEqual({
      shouldFail: true,
      enforced: true,
      reason: "1 of 1 failure(s) are NOT quarantined",
    });
  });

  it("gates as before against a server that serves no suite rules", async () => {
    const { result } = await withList({ tests: [] }, () => gate("e2e"));

    expect(result.shouldFail).toBe(true);
  });
});
