import {
  type Finding,
  MAX_BISECTS,
  applyBisected,
  bisectTargets,
  formatReport,
  namespaceOf,
  parseWarnings,
} from "./eastwood-report";

const finding = (overrides: Partial<Finding> = {}): Finding => ({
  target: "tests",
  file: "test/metabase/foo_test.clj",
  line: 12,
  column: 3,
  linter: "suspicious-test",
  msg: "Found (is ...) form",
  namespace: "metabase.foo-test",
  ...overrides,
});

const context = {
  date: "2026-11-02",
  runUrl: "https://github.com/metabase/metabase/actions/runs/1",
  repoUrl: "https://github.com/metabase/metabase",
  headSha: "h".repeat(40),
  lastGood: "g".repeat(40),
};

describe("namespaceOf", () => {
  it.each([
    ["src/metabase/util/match.clj", "metabase.util.match"],
    ["test/metabase/api/macros_test.clj", "metabase.api.macros-test"],
    [
      "enterprise/backend/test/metabase_enterprise/foo_test.clj",
      "metabase-enterprise.foo-test",
    ],
    [
      "modules/drivers/snowflake/src/metabase/driver/snowflake.clj",
      "metabase.driver.snowflake",
    ],
    ["dev/src/dev.clj", "dev"],
    ["src/metabase/lib/core.cljc", "metabase.lib.core"],
  ])("reads %s as %s", (file, namespace) => {
    expect(namespaceOf(file)).toBe(namespace);
  });

  it("knows no namespace outside the source roots", () => {
    expect(namespaceOf("jar:file:/x.jar!/clojure/core.clj")).toBeUndefined();
  });
});

describe("parseWarnings", () => {
  it("reads each warning, its kind dropped, and joins continuation lines to the message", () => {
    const text = [
      "Entering directory `/home/runner/work/metabase/metabase'",
      "test/metabase/foo_test.clj:12:3: suspicious-test: Found (is ...) form",
      "src/metabase/bar.clj:7:1: unused-ret-vals {:kind :pure}: Pure value discarded",
      "src/metabase/bar.clj:9:5: deprecations: Instance method 'public x' is deprecated.",
      "  second line",
      "",
    ].join("\n");
    expect(parseWarnings("source", text)).toEqual([
      expect.objectContaining({
        file: "test/metabase/foo_test.clj",
        line: 12,
        column: 3,
        linter: "suspicious-test",
        namespace: "metabase.foo-test",
      }),
      expect.objectContaining({ linter: "unused-ret-vals", line: 7 }),
      expect.objectContaining({
        linter: "deprecations",
        msg: "Instance method 'public x' is deprecated.\n  second line",
      }),
    ]);
  });
});

describe("bisectTargets", () => {
  it("lists each namespace and linter blame left without a cause, once", () => {
    expect(
      bisectTargets([
        finding(),
        finding({ line: 20 }),
        finding({ linter: "constant-test" }),
        finding({
          namespace: "metabase.bar-test",
          cause: { sha: "a", subject: "x" },
        }),
        finding({ namespace: undefined }),
      ]),
    ).toEqual([
      "tests metabase.foo-test suspicious-test",
      "tests metabase.foo-test constant-test",
    ]);
  });

  it(`stops at ${MAX_BISECTS}`, () => {
    const many = Array.from({ length: MAX_BISECTS + 2 }, (_, i) =>
      finding({ namespace: `metabase.ns-${i}` }),
    );
    expect(bisectTargets(many)).toHaveLength(MAX_BISECTS);
  });
});

describe("applyBisected", () => {
  it("fills in the bisected commit where blame found none, and keeps blame's", () => {
    const blamed = finding({ cause: { sha: "b", subject: "Blamed" } });
    const result = applyBisected(
      [finding(), blamed, finding({ linter: "constant-test" })],
      "tests metabase.foo-test suspicious-test c0ffee\n",
      (sha) => `Subject of ${sha}`,
    );
    expect(result.map((f) => f.cause)).toEqual([
      { sha: "c0ffee", subject: "Subject of c0ffee" },
      { sha: "b", subject: "Blamed" },
      undefined,
    ]);
  });
});

describe("formatReport", () => {
  it("groups findings under their PR, the biggest group first and the unexplained last", () => {
    const one = { sha: "1".repeat(40), subject: "Fix things (#85001)" };
    const two = { sha: "2".repeat(40), subject: "Direct commit" };
    const report = formatReport(
      [
        finding({ cause: one }),
        finding({ line: 30 }),
        finding({ cause: two, line: 40 }),
        finding({ cause: two, line: 50 }),
      ],
      context,
    );
    const headings = report
      .split("\n")
      .filter((line) => line.startsWith("### "));
    expect(headings).toEqual([
      "### [`22222222222`](https://github.com/metabase/metabase/commit/2222222222222222222222222222222222222222) Direct commit",
      "### [#85001](https://github.com/metabase/metabase/pull/85001) Fix things",
      "### Cause not found",
    ]);
    expect(report).toContain("found **4 findings** on 2026-11-02");
    expect(report).toContain(
      "- [`test/metabase/foo_test.clj:12`](https://github.com/metabase/metabase/blob/hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh/test/metabase/foo_test.clj#L12) `suspicious-test`: Found (is ...) form",
    );
  });

  it("says the causes are only the last change to each line when no run has passed", () => {
    expect(formatReport([finding()], { ...context, lastGood: "" })).toContain(
      "No earlier run passed",
    );
  });
});
