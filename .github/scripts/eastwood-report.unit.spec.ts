import {
  type Finding,
  MAX_BISECTS,
  MAX_LISTED,
  MAX_MSG,
  applyBisected,
  bisectTargets,
  carryOver,
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
  key: "test/metabase/foo_test.clj: suspicious-test: Found (is ...) form",
  namespace: "metabase.foo-test",
  firstSeen: "2026-11-02",
  ...overrides,
});

const context = {
  date: "2026-11-02",
  runUrl: "https://github.com/metabase/metabase/actions/runs/1",
  repoUrl: "https://github.com/metabase/metabase",
  headSha: "h".repeat(40),
  baseSha: "b".repeat(40),
};

const headings = (report: string) =>
  report.split("\n").filter((line) => line.startsWith("#"));

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
  it("reads each warning, keyed without its position, and joins continuation lines to the message", () => {
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
        key: "test/metabase/foo_test.clj: suspicious-test: Found (is ...) form",
        namespace: "metabase.foo-test",
      }),
      expect.objectContaining({
        linter: "unused-ret-vals",
        line: 7,
        key: "src/metabase/bar.clj: unused-ret-vals {:kind :pure}: Pure value discarded",
      }),
      expect.objectContaining({
        linter: "deprecations",
        msg: "Instance method 'public x' is deprecated.\n  second line",
      }),
    ]);
  });
});

describe("carryOver", () => {
  const cause = { sha: "a".repeat(40), subject: "Old change (#85000)" };
  const earlier = finding({ cause, firstSeen: "2026-10-19", line: 10 });

  it("keeps a finding's cause and first-seen date from the previous run, even when its line moved", () => {
    expect(carryOver([finding({ line: 14 })], [earlier], "2026-11-02")).toEqual(
      [finding({ line: 14, cause, firstSeen: "2026-10-19", carried: true })],
    );
  });

  it("dates a finding the previous run didn't report today, and leaves its cause to blame", () => {
    const fresh = finding({ key: "other", firstSeen: undefined });
    expect(carryOver([fresh], [earlier], "2026-11-02")).toEqual([
      { ...fresh, firstSeen: "2026-11-02" },
    ]);
  });

  it("matches each previous finding once, so a second copy of a warning is new", () => {
    const findings = carryOver(
      [finding(), finding({ line: 30 })],
      [earlier],
      "2026-11-02",
    );
    expect(findings.map((f) => f.carried)).toEqual([true, undefined]);
  });

  it("doesn't match the same warning from the other target", () => {
    expect(
      carryOver([finding({ target: "source" })], [earlier], "2026-11-02")[0]
        .carried,
    ).toBeUndefined();
  });
});

describe("bisectTargets", () => {
  it("lists each new namespace and linter blame left without a cause, once", () => {
    expect(
      bisectTargets([
        finding(),
        finding({ line: 20 }),
        finding({ linter: "constant-test" }),
        finding({
          namespace: "metabase.bar-test",
          cause: { sha: "a", subject: "x" },
        }),
        finding({ namespace: "metabase.baz-test", carried: true }),
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
  it("fills in the bisected commit only for new findings without a cause", () => {
    const blamed = finding({ cause: { sha: "b", subject: "Blamed" } });
    const carried = finding({ carried: true });
    const result = applyBisected(
      [finding(), blamed, carried, finding({ linter: "constant-test" })],
      "tests metabase.foo-test suspicious-test c0ffee\n",
      (sha) => `Subject of ${sha}`,
    );
    expect(result.map((f) => f.cause)).toEqual([
      { sha: "c0ffee", subject: "Subject of c0ffee" },
      { sha: "b", subject: "Blamed" },
      undefined,
      undefined,
    ]);
  });
});

describe("formatReport", () => {
  const one = { sha: "1".repeat(40), subject: "Fix things (#85001)" };
  const two = { sha: "2".repeat(40), subject: "Direct commit" };

  it("puts new findings before those still open, each grouped under its cause", () => {
    const report = formatReport(
      [
        finding({ cause: one }),
        finding({ line: 30 }),
        finding({ cause: two, line: 40 }),
        finding({ cause: two, line: 50 }),
        finding({
          cause: one,
          line: 60,
          carried: true,
          firstSeen: "2026-10-26",
        }),
        finding({
          cause: one,
          line: 70,
          carried: true,
          firstSeen: "2026-10-19",
        }),
      ],
      context,
    );
    expect(headings(report)).toEqual([
      "## New since the previous run",
      "### [`22222222222`](https://github.com/metabase/metabase/commit/2222222222222222222222222222222222222222) Direct commit",
      "### [#85001](https://github.com/metabase/metabase/pull/85001) Fix things",
      "### Cause not found",
      "## Still open",
      "### [#85001](https://github.com/metabase/metabase/pull/85001) Fix things, first seen 2026-10-19",
    ]);
    expect(report).toContain(
      "found **6 findings** on 2026-11-02 ([run](https://github.com/metabase/metabase/actions/runs/1)): 4 new since the previous run at [`bbbbbbbbbbb`]",
    );
    expect(report).toContain(
      "- [`test/metabase/foo_test.clj:12`](https://github.com/metabase/metabase/blob/hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh/test/metabase/foo_test.clj#L12) `suspicious-test`: Found (is ...) form",
    );
  });

  it(`lists at most ${MAX_LISTED} findings and counts the rest`, () => {
    const many = Array.from({ length: MAX_LISTED + 5 }, (_, i) =>
      finding({ line: i + 1 }),
    );
    const report = formatReport(many, context);
    expect(
      report.split("\n").filter((line) => line.startsWith("- ")),
    ).toHaveLength(MAX_LISTED);
    expect(report).toContain("…and 5 more in the run.");
  });

  it(`cuts a message at ${MAX_MSG} characters, and puts it on one line`, () => {
    const report = formatReport(
      [finding({ msg: `first\nsecond ${"x".repeat(MAX_MSG)}` })],
      context,
    );
    const item = report.split("\n").find((line) => line.startsWith("- "));
    expect(item).toMatch(/`suspicious-test`: first second x+…$/);
    expect(item?.split("`: ")[1]).toHaveLength(MAX_MSG + 1);
  });

  it("leaves out a section with nothing in it", () => {
    expect(
      headings(formatReport([finding({ carried: true })], context)),
    ).toEqual(["## Still open", "### Cause not found, first seen 2026-11-02"]);
  });

  it("lists everything together, under the last change to each line, when there is no previous run", () => {
    const report = formatReport([finding({ cause: one })], {
      ...context,
      baseSha: "",
    });
    expect(headings(report)).toEqual([
      "## Findings",
      "### [#85001](https://github.com/metabase/metabase/pull/85001) Fix things",
    ]);
    expect(report).toContain("No earlier run left a report to compare with");
  });
});
