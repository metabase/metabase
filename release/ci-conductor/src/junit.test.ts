import { describe, expect, it } from "bun:test";

import { parseJunit } from "./junit.ts";

// A real hawk failure body: first line is `file.clj:line`, then context, then
// the expected/actual assertion. Two <failure>s under one <testcase>.
const TWO_FAILURES = `<?xml version='1.0' encoding='UTF-8'?>
<testsuite name="metabase.agent-lib.representations.repair-test" time="0.039" tests="2" errors="0" failures="2">
<testcase classname="metabase.agent-lib.representations.repair-test" name="idempotency-unwrapped-boolean-wrapper-test" time="0.033" assertions="2">
<failure>
<![CDATA[
repair_test.clj:1184
unwrapping a boolean wrapper stays idempotent
expected: (= [["x" {}]] once)
  actual: (not (= [["x" {}]] ["x"]))
]]>
</failure>
<failure>
<![CDATA[
repair_test.clj:1186
and the result is a fixed point
expected: (= once (repair/repair trivial-mp once))
  actual: (not (= ["x"] ["x" {}]))
]]>
</failure>
</testcase>
</testsuite>`;

// Test names routinely contain unescaped `>`/`<` (Clojure thread arrows `->`,
// comparison preds `>=`; a JS title like "renders > when open"). A JUnit
// producer emits them verbatim in the `name` attribute, and XML allows an
// unescaped `>` inside an attribute value. The parser must not let that `>`
// terminate the tag. Regression for DEV-2224 (these were silently dropped: the
// testcase parsed with an empty name and got skipped).
const ANGLE_BRACKET_NAMES = `<?xml version='1.0' encoding='UTF-8'?>
<testsuite name="metabase.util.cron-test" time="0.063" tests="2" errors="0" failures="2">
<testcase classname="metabase.util.cron-test" name="cron-string->schedule-map-test" time="0.03" assertions="1">
<failure>
<![CDATA[
cron_test.clj:65
nope
]]>
</failure>
</testcase>
<testcase classname="metabase.util.cron-test" name="schedule-map->cron-string-test" time="0.03" assertions="1">
<failure>
<![CDATA[
cron_test.clj:12
also nope
]]>
</failure>
</testcase>
</testsuite>`;

// A passing testcase (self-closing) mixed with an errored one in the same suite.
const PASS_AND_ERROR = `<?xml version='1.0' encoding='UTF-8'?>
<testsuite name="metabase.foo-test" tests="2" errors="1" failures="0">
<testcase classname="metabase.foo-test" name="passing-test" time="0.01" assertions="1"/>
<testcase classname="metabase.foo-test" name="erroring-test" time="0.02">
<error>
<![CDATA[
foo_test.clj:42
boom
java.lang.RuntimeException: boom
]]>
</error>
</testcase>
</testsuite>`;

// Two suites in one document (defensive: also covers a <testsuites> wrapper,
// since we scan testcases regardless of nesting).
const TWO_SUITES = `<?xml version='1.0' encoding='UTF-8'?>
<testsuites>
<testsuite name="metabase.a-test" tests="1" failures="1">
<testcase classname="metabase.a-test" name="a" time="0.01">
<failure><![CDATA[a_test.clj:1
nope
]]></failure>
</testcase>
</testsuite>
<testsuite name="metabase.b-test" tests="1" failures="1">
<testcase classname="metabase.b-test" name="b" time="0.01">
<failure><![CDATA[b_test.clj:2
also nope
]]></failure>
</testcase>
</testsuite>
</testsuites>`;

// hawk with the `message` attribute (https://github.com/metabase/hawk/pull/49):
// the failure carries a first-class `message`, and the body still holds the
// file:line locator + full assertion. The parser must prefer the attribute.
const FAILURE_WITH_MESSAGE = `<?xml version='1.0' encoding='UTF-8'?>
<testsuite name="metabase.foo-test" tests="1" errors="0" failures="1">
<testcase classname="metabase.foo-test" name="bar-test" time="0.01" assertions="1">
<failure message="expected: (= 1 2)">
<![CDATA[
foo_test.clj:42
expected: (= 1 2)
  actual: (not (= 1 2))
]]>
</failure>
</testcase>
</testsuite>`;

// hawk emits `message` on <error> too, alongside the `type` attribute (the
// :error branch of write-assertion-result!* in hawk PR #49). The parser must
// read the message off an <error> the same as a <failure>, ignoring `type`.
const ERROR_WITH_MESSAGE = `<?xml version='1.0' encoding='UTF-8'?>
<testsuite name="metabase.foo-test" tests="1" errors="1" failures="0">
<testcase classname="metabase.foo-test" name="boom-test" time="0.01">
<error type="clojure.lang.ExceptionInfo" message="boom">
<![CDATA[
foo_test.clj:99
java.lang.RuntimeException: boom
]]>
</error>
</testcase>
</testsuite>`;

// hawk's var-less error file (mb_hawk_var_less_errors.xml, hawk PR #50): an
// error with no test var — a fixture-init throw or namespace load/compile
// failure. The testcase carries a `name` but deliberately NO `classname`, so it
// must parse to a namespace-less (`path` undefined) failure — that's what forces
// the granular-rerun collector into a full rerun rather than a narrow one.
const VAR_LESS_ERROR = `<?xml version='1.0' encoding='UTF-8'?>
<testsuite name="mb.hawk.var-less-errors" tests="1" errors="1" failures="0">
<testcase name="Uncaught error with no associated test var (metabase.foo-test :once fixture)">
<error type="clojure.lang.ExceptionInfo" message="boom in fixture">
<![CDATA[
java.lang.RuntimeException: boom in fixture
]]>
</error>
</testcase>
</testsuite>`;

// jest-junit with `addFileAttribute: "true"` emits a `file` attribute holding
// the source path, plus an entity-escaped (non-CDATA) failure body. The parser
// must surface that path as `file` and decode the body.
const JEST_WITH_FILE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="jest tests" tests="1" failures="1">
<testsuite name="Button" failures="1" tests="1">
<testcase classname="Button when open renders &gt; the label" name="Button when open renders &gt; the label" time="0.012" file="frontend/src/metabase/components/Button/Button.unit.spec.tsx">
<failure>Error: expect(received).toBe(expected)

    at Button.unit.spec.tsx:42:18</failure>
</testcase>
</testsuite>
</testsuites>`;

// A jest-junit document as it looks on a *rerun*: mostly passes (self-closing
// testcases) with one failure. This is the shape `ignorePassingTests: false`
// exists for — ci-conductor needs the passes to tell a flake (failed, then
// passed on rerun) from a genuine failure.
const JEST_MOSTLY_PASSING = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="jest tests" tests="3" failures="1">
<testsuite name="Button" failures="1" tests="3">
<testcase classname="Button renders" name="Button renders" time="0.01" file="frontend/src/metabase/components/Button/Button.unit.spec.tsx"/>
<testcase classname="Button is disabled" name="Button is disabled" time="0.02" file="frontend/src/metabase/components/Button/Button.unit.spec.tsx"/>
<testcase classname="Button explodes" name="Button explodes" time="0.03" file="frontend/src/metabase/components/Button/Button.unit.spec.tsx">
<failure message="expect(received).toBe(expected)">Error: expect(received).toBe(expected)</failure>
</testcase>
</testsuite>
</testsuites>`;

// A testcase that has a body but no <failure>/<error> — jest-junit emits this
// shape when a passing test wrote to stdout. It passed, same as a self-closing
// one.
const PASSING_WITH_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="metabase.foo-test" tests="1" failures="0">
<testcase classname="metabase.foo-test" name="chatty-test" time="0.01">
<system-out>some log output</system-out>
</testcase>
</testsuite>`;

// jest marks a skipped test (`it.skip`/`xit`, or a suite it never ran) with a
// <skipped/> child; a producer may also write it with a `message` attribute or a
// body. A real run mixes skips in among the passes and failures.
const SKIPPED = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="Button" tests="4" failures="1" skipped="2">
<testcase classname="Button is todo" name="Button is todo" time="0">
<skipped/>
</testcase>
<testcase classname="Button is deferred" name="Button is deferred" time="0">
<skipped message="pending"/>
</testcase>
<testcase classname="Button renders" name="Button renders" time="0.01"/>
<testcase classname="Button explodes" name="Button explodes" time="0.02">
<failure message="boom">Error: boom</failure>
</testcase>
</testsuite>`;

describe("parseJunit", () => {
  it("prefers the failure `message` attribute over the body", () => {
    const [test] = parseJunit(FAILURE_WITH_MESSAGE);
    expect(test.message).toBe("expected: (= 1 2)");
    // The full trace, including the locator, stays in the stack.
    expect(test.stack).toContain("foo_test.clj:42");
  });

  it("reads the `message` attribute off an <error>, ignoring `type`", () => {
    const [test] = parseJunit(ERROR_WITH_MESSAGE);
    expect(test.message).toBe("boom");
    expect(test.status).toBe("failure");
    expect(test.stack).toContain("java.lang.RuntimeException: boom");
  });

  it("collapses multiple <failure>s in one testcase into a single entry", () => {
    const tests = parseJunit(TWO_FAILURES);
    expect(tests).toHaveLength(1);
    const [test] = tests;
    expect(test.name).toBe("idempotency-unwrapped-boolean-wrapper-test");
    expect(test.path).toBe("metabase.agent-lib.representations.repair-test");
    // file_path is intentionally null — backend identity is (suite, path, name).
    expect(test.file).toBeNull();
    expect(test.status).toBe("failure");
    // No `message` attribute on the <failure> => null (we don't guess from the
    // body; its first line is the file:line locator, not a message).
    expect(test.message).toBeNull();
    // The stack carries both failures.
    expect(test.stack).toContain("repair_test.clj:1184");
    expect(test.stack).toContain("repair_test.clj:1186");
  });

  it("parses test names containing unescaped angle brackets (Clojure `->`)", () => {
    const tests = parseJunit(ANGLE_BRACKET_NAMES);
    expect(tests.map((t) => t.name).sort()).toEqual([
      "cron-string->schedule-map-test",
      "schedule-map->cron-string-test",
    ]);
    expect(tests.every((t) => t.path === "metabase.util.cron-test")).toBe(true);
    expect(tests.every((t) => t.status === "failure")).toBe(true);
  });

  it("reports errored tests as failures and skips passing tests", () => {
    const tests = parseJunit(PASS_AND_ERROR);
    expect(tests).toHaveLength(1);
    expect(tests[0].name).toBe("erroring-test");
    expect(tests[0].file).toBeNull();
    expect(tests[0].status).toBe("failure");
    expect(tests[0].stack).toContain("java.lang.RuntimeException: boom");
  });

  it("handles multiple suites / a <testsuites> wrapper", () => {
    const tests = parseJunit(TWO_SUITES);
    expect(tests.map((t) => t.name).sort()).toEqual(["a", "b"]);
    expect(tests.map((t) => t.path).sort()).toEqual([
      "metabase.a-test",
      "metabase.b-test",
    ]);
  });

  it("surfaces the testcase `file` attribute as file_path (frontend/jest)", () => {
    const tests = parseJunit(JEST_WITH_FILE);
    expect(tests).toHaveLength(1);
    const [test] = tests;
    expect(test.file).toBe(
      "frontend/src/metabase/components/Button/Button.unit.spec.tsx",
    );
    // The unescaped `>` in the title survives decoding.
    expect(test.name).toBe("Button when open renders > the label");
    // The <failure> has no `message` attribute, so message is null; the body
    // text lands in `stack`.
    expect(test.message).toBeNull();
    expect(test.stack).toContain("Error: expect(received).toBe(expected)");
    expect(test.status).toBe("failure");
  });

  it("parses a var-less error (no classname) to a namespace-less failure", () => {
    const tests = parseJunit(VAR_LESS_ERROR);
    expect(tests).toHaveLength(1);
    const [test] = tests;
    // No classname => no namespace => the rerun collector can't attribute it and
    // (correctly) falls back to a full rerun.
    expect(test.path).toBeUndefined();
    expect(test.name).toBe(
      "Uncaught error with no associated test var (metabase.foo-test :once fixture)",
    );
    expect(test.message).toBe("boom in fixture");
    expect(test.status).toBe("failure");
  });

  it("returns [] for malformed XML without throwing", () => {
    expect(parseJunit("<not-valid")).toEqual([]);
  });

  it("drops skipped tests, keeping only the failure", () => {
    const tests = parseJunit(SKIPPED);
    expect(tests.map((t) => t.name)).toEqual(["Button explodes"]);
  });

  it("returns [] for a suite with only passing tests", () => {
    const xml = `<testsuite name="metabase.ok-test" tests="1" failures="0">
<testcase classname="metabase.ok-test" name="ok" time="0.01"/>
</testsuite>`;
    expect(parseJunit(xml)).toEqual([]);
  });
});

describe("parseJunit with ignorePassingTests: false", () => {
  it("emits self-closing (passing) testcases with status `passed`", () => {
    const tests = parseJunit(PASS_AND_ERROR, false);
    expect(tests).toHaveLength(2);
    const passed = tests.find((t) => t.name === "passing-test");
    expect(passed).toBeDefined();
    expect(passed!.status).toBe("passed");
    expect(passed!.path).toBe("metabase.foo-test");
    // Nothing went wrong, so there's no message or stack to carry.
    expect(passed!.message).toBeNull();
    expect(passed!.stack).toBeUndefined();
  });

  it("still reports failures as failures alongside the passes", () => {
    const tests = parseJunit(PASS_AND_ERROR, false);
    const errored = tests.find((t) => t.name === "erroring-test");
    expect(errored).toBeDefined();
    expect(errored!.status).toBe("failure");
    expect(errored!.stack).toContain("java.lang.RuntimeException: boom");
  });

  it("reports every test in a mostly-passing jest rerun, keeping `file`", () => {
    const tests = parseJunit(JEST_MOSTLY_PASSING, false);
    expect(
      tests.map((t) => [t.name, t.status]).sort((a, b) => a[0]!.localeCompare(b[0]!)),
    ).toEqual([
      ["Button explodes", "failure"],
      ["Button is disabled", "passed"],
      ["Button renders", "passed"],
    ]);
    expect(
      tests.every(
        (t) =>
          t.file ===
          "frontend/src/metabase/components/Button/Button.unit.spec.tsx",
      ),
    ).toBe(true);
  });

  it("treats a testcase with a body but no <failure>/<error> as passed", () => {
    const tests = parseJunit(PASSING_WITH_BODY, false);
    expect(tests).toHaveLength(1);
    expect(tests[0].status).toBe("passed");
    expect(parseJunit(PASSING_WITH_BODY)).toEqual([]);
  });

  it("reports a suite of only passing tests instead of []", () => {
    const xml = `<testsuite name="metabase.ok-test" tests="1" failures="0">
<testcase classname="metabase.ok-test" name="ok" time="0.01"/>
</testsuite>`;
    expect(parseJunit(xml, false)).toEqual([
      {
        name: "ok",
        path: "metabase.ok-test",
        file: null,
        message: null,
        stack: undefined,
        status: "passed",
      },
    ]);
  });

  it("still returns [] for malformed XML without throwing", () => {
    expect(parseJunit("<not-valid", false)).toEqual([]);
  });

  it("drops skipped tests while keeping the passes and failures around them", () => {
    const tests = parseJunit(SKIPPED, false);
    expect(
      tests
        .map((t) => [t.name, t.status])
        .sort((a, b) => a[0]!.localeCompare(b[0]!)),
    ).toEqual([
      ["Button explodes", "failure"],
      ["Button renders", "passed"],
    ]);
  });
});
