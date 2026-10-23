import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeBackendJunit } from "./backend.ts";

const failingSuite = (
  ns: string,
  name: string,
) => `<?xml version='1.0' encoding='UTF-8'?>
<testsuite name="${ns}" tests="1" errors="0" failures="1">
<testcase classname="${ns}" name="${name}" assertions="1">
<failure>
<![CDATA[
file.clj:1
expected: true
  actual: false
]]>
</failure>
</testcase>
</testsuite>`;

const VAR_LESS_ERROR = `<?xml version='1.0' encoding='UTF-8'?>
<testsuite name="mb.hawk.var-less-errors" tests="1" errors="1" failures="0">
<testcase name="Uncaught error with no associated test var">
<error type="clojure.lang.ExceptionInfo" message="boom">
<![CDATA[
boom
]]>
</error>
</testcase>
</testsuite>`;

describe("normalizeBackendJunit", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ci-conductor-backend-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads every hawk JUnit file, whatever the namespace name", () => {
    mkdirSync(join(dir, "p0"));
    writeFileSync(
      join(dir, "p0", "metabase.a_test.xml"),
      failingSuite("metabase.a-test", "a-test"),
    );
    writeFileSync(
      join(dir, "p0", "metabase.app_db.general_schema_tests.xml"),
      failingSuite(
        "metabase.app-db.general-schema-tests",
        "fks-are-indexed-test",
      ),
    );
    writeFileSync(
      join(dir, "metabase.test.util.xml"),
      failingSuite("metabase.test.util", "util-test"),
    );
    writeFileSync(join(dir, "mb_hawk_var_less_errors.xml"), VAR_LESS_ERROR);
    writeFileSync(join(dir, "notes.txt"), "not junit");

    const tests = normalizeBackendJunit(true, dir);

    expect(tests.map((t) => `${t.path ?? ""}/${t.name}`).sort()).toEqual([
      "/Uncaught error with no associated test var",
      "metabase.a-test/a-test",
      "metabase.app-db.general-schema-tests/fks-are-indexed-test",
      "metabase.test.util/util-test",
    ]);
  });
});
