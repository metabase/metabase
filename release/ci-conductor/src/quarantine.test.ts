import { describe, expect, it } from "bun:test";

import type { NormalizedTest } from "./contract.ts";
import {
  type FailedTest,
  type GateResult,
  type QuarantineEntry,
  checkQuarantineGate,
  compareFailedToQuarantine,
  junitFailuresToFailedTests,
  matchKey,
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
): QuarantineEntry => ({ test_name, test_path, file_path, test_suite: "e2e" });

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

  it("puts every failure in `quarantined` when all are listed", () => {
    const failures = [failed("a"), failed("b")];

    const { quarantined: q, unquarantined } = compareFailedToQuarantine(
      failures,
      [quarantined("a"), quarantined("b")],
    );

    expect(q).toEqual(failures);
    expect(unquarantined).toEqual([]);
  });

  it("partitions a mixed set", () => {
    const a = failed("a");
    const b = failed("b");
    const c = failed("c");

    const { quarantined: q, unquarantined } = compareFailedToQuarantine(
      [a, b, c],
      [quarantined("a"), quarantined("c")],
    );

    expect(q).toEqual([a, c]);
    expect(unquarantined).toEqual([b]);
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
    const failure = failed("a", null, null);

    const { quarantined: q } = compareFailedToQuarantine(
      [failure],
      [quarantined("a", "", "")],
    );

    expect(q).toEqual([failure]);
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
    expect(
      matchKey({ filePath: "a", testPath: "b", testName: "c" }),
    ).not.toBe(matchKey({ filePath: "ab", testPath: "", testName: "c" }));
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

describe("checkQuarantineGate", () => {
  const failure: FailedTest = {
    test_name: "renders",
    test_path: "Suite",
    file_path: "foo.spec.ts",
  };

  // Both branches under test return before any fetch, so no network is touched.
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

  it("passes without a verdict line when there are no failures to gate", async () => {
    const { result, verdict } = await runCapturingLogs({
      suite: "e2e",
      failures: [],
      baseUrl: undefined,
      secret: undefined,
      dryRun: true,
    });
    expect(result).toEqual({
      shouldFail: false,
      enforced: false,
      reason: "no failures to gate",
    });
    expect(verdict).toBeUndefined();
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
});
