import { parseJunit } from "./report-junit-failures";

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

describe("parseJunit", () => {
  it("collapses multiple <failure>s in one testcase into a single entry", () => {
    const tests = parseJunit(TWO_FAILURES);
    expect(tests).toHaveLength(1);
    const [test] = tests;
    expect(test.name).toBe("idempotency-unwrapped-boolean-wrapper-test");
    expect(test.path).toBe("metabase.agent-lib.representations.repair-test");
    // file_path is intentionally null — backend identity is (suite, path, name).
    expect(test.file).toBeNull();
    expect(test.status).toBe("failure");
    // The message is the first line of the failure body — the file:line locator.
    expect(test.message).toBe("repair_test.clj:1184");
    // The stack carries both failures.
    expect(test.stack).toContain("repair_test.clj:1184");
    expect(test.stack).toContain("repair_test.clj:1186");
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

  it("returns [] for malformed XML without throwing", () => {
    expect(parseJunit("<not-valid")).toEqual([]);
  });

  it("returns [] for a suite with only passing tests", () => {
    const xml = `<testsuite name="metabase.ok-test" tests="1" failures="0">
<testcase classname="metabase.ok-test" name="ok" time="0.01"/>
</testsuite>`;
    expect(parseJunit(xml)).toEqual([]);
  });
});
