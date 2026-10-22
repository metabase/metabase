import { describe, expect, it } from "bun:test";

import ts from "typescript";

import {
  buildIndex,
  indexFromManifest,
  findTests,
  parseKey,
  toRepoRelative,
} from "./verify/coverage";
import {
  chunk,
  mutantOf,
  stripMutant,
  wrapperPath,
  wrapperSource,
} from "./verify/jest";
import {
  type PassResults,
  classifyFailure,
  collectPass,
  failingPairs,
  judgeMutant,
} from "./verify/judge";
import { mapLine, parseDeletedTests, parseHunks } from "./verify/lines";
import {
  applySchemata,
  functionAtLine,
  mutantsForFunction,
  parseSource,
} from "./verify/mutants";

describe("deleted tests from a diff", () => {
  it("reads removed it() titles with their spec", () => {
    const diff = [
      "diff --git a/e2e/test/scenarios/admin/x.cy.spec.ts b/e2e/test/scenarios/admin/x.cy.spec.ts",
      "--- a/e2e/test/scenarios/admin/x.cy.spec.ts",
      "+++ b/e2e/test/scenarios/admin/x.cy.spec.ts",
      '-  it("shows the thing", () => {',
      "-    cy.visit('/');",
      "+  it('keeps this one', () => {",
      "-  it.skip(`skipped one`, () => {",
      "--- a/frontend/src/x.unit.spec.ts",
      '-  it("not an e2e test", () => {',
    ].join("\n");
    expect(parseDeletedTests(diff)).toEqual([
      {
        spec: "e2e/test/scenarios/admin/x.cy.spec.ts",
        title: "shows the thing",
      },
      { spec: "e2e/test/scenarios/admin/x.cy.spec.ts", title: "skipped one" },
    ]);
  });
});

describe("line mapping through hunks", () => {
  const hunks = parseHunks(
    ["@@ -3,2 +3,5 @@", "@@ -10,0 +14,2 @@", "@@ -20,3 +26,0 @@"].join("\n"),
  );

  it("keeps lines before the first hunk", () => {
    expect(mapLine(hunks, 2)).toBe(2);
  });

  it("drops lines inside a changed region", () => {
    expect(mapLine(hunks, 4)).toBeNull();
    expect(mapLine(hunks, 21)).toBeNull();
  });

  it("shifts lines after replacements and insertions", () => {
    expect(mapLine(hunks, 6)).toBe(9);
    expect(mapLine(hunks, 10)).toBe(13);
    expect(mapLine(hunks, 11)).toBe(16);
    expect(mapLine(hunks, 24)).toBe(26);
  });
});

const SOURCE = `
import { t } from "ttag";
export function Panel({ enabled, onSave }: { enabled: boolean; onSave: () => void }) {
  const label = enabled ? "On" : "Off";
  if (!enabled) {
    return null;
  }
  onSave();
  return <button title="x" aria-label={label} data-testid="panel">{t\`Save\`}</button>;
}
const helper = (value: string) => value.toUpperCase();
`;

describe("mutants", () => {
  const sourceFile = parseSource("Panel.tsx", SOURCE);

  it("finds the function that starts on a line", () => {
    expect(functionAtLine(sourceFile, 3)?.startLine).toBe(3);
    expect(functionAtLine(sourceFile, 11)?.endLine).toBe(11);
    expect(functionAtLine(sourceFile, 4)).toBeNull();
  });

  it("plans non-overlapping mutants by kind priority", () => {
    const fn = functionAtLine(sourceFile, 3);
    if (!fn) {
      throw new Error("function not found");
    }
    let id = 1;
    const mutants = mutantsForFunction(
      sourceFile,
      "Panel.tsx",
      fn,
      "Panel",
      10,
      () => id++,
    );
    expect(mutants.map((mutant) => mutant.kind)).toEqual([
      "return-undefined",
      "return-undefined",
      "if-false",
      "ternary-false",
      "remove-call",
      "jsx-prop-undefined",
      "string-empty",
      "string-empty",
    ]);
    expect(
      mutants.every((mutant) => mutant.line >= 4 && mutant.line <= 9),
    ).toBe(true);
  });

  it("caps mutants per function", () => {
    const fn = functionAtLine(sourceFile, 3);
    if (!fn) {
      throw new Error("function not found");
    }
    expect(
      mutantsForFunction(sourceFile, "Panel.tsx", fn, "Panel", 2, () => 1),
    ).toHaveLength(2);
  });

  it("mutates an expression-bodied arrow function's result", () => {
    const fn = functionAtLine(sourceFile, 11);
    if (!fn) {
      throw new Error("function not found");
    }
    const mutants = mutantsForFunction(
      sourceFile,
      "Panel.tsx",
      fn,
      "helper",
      4,
      () => 7,
    );
    expect(mutants[0].kind).toBe("return-undefined");
    expect(applySchemata(SOURCE, mutants)).toContain(
      "(globalThis.__E2E_MUTANT__ === 7 ? undefined : (value.toUpperCase()))",
    );
  });

  it("produces schemata that still compile and keep the original when the switch is off", () => {
    const fn = functionAtLine(sourceFile, 3);
    if (!fn) {
      throw new Error("function not found");
    }
    let id = 1;
    const mutants = mutantsForFunction(
      sourceFile,
      "Panel.tsx",
      fn,
      "Panel",
      10,
      () => id++,
    );
    const output = applySchemata(SOURCE, mutants);
    const compiled = ts.transpileModule(output, {
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        target: ts.ScriptTarget.ES2020,
      },
      reportDiagnostics: true,
    });
    expect(compiled.diagnostics ?? []).toHaveLength(0);
    expect(output).toContain(
      "if (globalThis.__E2E_MUTANT__ !== 5) { onSave(); }",
    );
    expect(output).toContain(
      "(globalThis.__E2E_MUTANT__ === 4 ? false : (enabled))",
    );
  });
});

describe("wrapper spec", () => {
  it("gives each spec in one directory its own wrapper files", () => {
    const dir = "frontend/src/metabase/admin/databases/containers";
    const specs = [
      `${dir}/DatabaseEditApp.unit.spec.tsx`,
      `${dir}/DatabaseListApp.unit.spec.tsx`,
      `${dir}/DatabasePage.unit.spec.tsx`,
    ];
    const paths = specs.flatMap((spec) =>
      [0, 1, 2].map((index) => wrapperPath(spec, index)),
    );
    expect(new Set(paths).size).toBe(paths.length);
    expect(wrapperPath(specs[1], 0)).toMatch(/__e2e_verify_DatabaseListApp_0/);
  });

  it("registers each test once per mutant and names it with the mutant", () => {
    const source = wrapperSource("Thing.unit.spec", [0, 3]);
    expect(source).toContain('require("./Thing.unit.spec")');
    expect(source).toContain("const MUTANTS = [0,3];");
    expect(source).toContain("globalThis.__E2E_MUTANT__ = m");
    expect(mutantOf("[m3] renders")).toBe(3);
    expect(mutantOf("renders")).toBeNull();
    expect(stripMutant("Thing › [m3] renders")).toBe("Thing › renders");
  });

  it("deals mutant ids round-robin into wrapper groups", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 3, 5],
      [2, 4],
    ]);
    expect(chunk([1, 2], 4)).toEqual([[1], [2]]);
    expect(chunk([], 4)).toEqual([]);
  });
});

describe("judge", () => {
  const observation = (
    outcome: "passed" | "failed" | "other",
    observed = false,
  ) => ({ outcome, observed });
  const pass = (
    rows: [string, Record<number, ReturnType<typeof observation>>][],
  ): PassResults =>
    new Map(
      rows.map(([name, byMutant]) => [
        name,
        new Map(
          Object.entries(byMutant).map(([id, value]) => [Number(id), value]),
        ),
      ]),
    );

  it("classifies assertion failures", () => {
    expect(classifyFailure(["expect(received).toBe(expected)"]).observed).toBe(
      true,
    );
    expect(classifyFailure(["TypeError: x is not a function"]).observed).toBe(
      false,
    );
  });

  it("counts a crash in the spec's own frame as an observation", () => {
    const inSpec = classifyFailure([
      [
        "TypeError: Cannot read properties of undefined (reading 'data')",
        "    at Object.<anonymous> (/repo/src/thing/use-thing.unit.spec.ts:21:28)",
        "    at Promise.then.completed (/repo/node_modules/jest-circus/build/utils.js:298:28)",
      ].join("\n"),
    ]);
    expect(inSpec.observed).toBe(true);

    const inProduct = classifyFailure([
      [
        "TypeError: Cannot read properties of undefined (reading 'map')",
        "    at AdvisoryList (/repo/src/thing/AdvisoryList.tsx:49:31)",
        "    at Object.<anonymous> (/repo/src/thing/AdvisoryList.unit.spec.tsx:12:5)",
      ].join("\n"),
    ]);
    expect(inProduct.observed).toBe(false);
    expect(inProduct.note).toBe("error in product code, not an assertion");
  });

  it("never counts a jest timeout as an observation", () => {
    const timedOut = classifyFailure([
      [
        "thrown: Exceeded timeout of 25000 ms for a test.",
        "    at Object.<anonymous> (/repo/src/thing/use-thing.unit.spec.ts:21:28)",
      ].join("\n"),
    ]);
    expect(timedOut.observed).toBe(false);
    expect(timedOut.note).toBe("timed out");
  });

  it("needs a clean pass, an assertion failure, and a confirmed rerun", () => {
    const fast = pass([
      [
        "Thing › renders",
        { 0: observation("passed"), 1: observation("failed", true) },
      ],
    ]);
    const confirm = pass([
      [
        "Thing › renders",
        { 0: observation("passed"), 1: observation("failed", true) },
      ],
    ]);
    expect(judgeMutant(1, fast, confirm)).toEqual({
      status: "caught",
      by: ["Thing › renders"],
    });
    const flaky = pass([
      [
        "Thing › renders",
        { 0: observation("passed"), 1: observation("passed") },
      ],
    ]);
    expect(judgeMutant(1, fast, flaky).status).toBe("unmeasured");
  });

  it("marks a mutant survived only when a clean-passing test ran it and passed", () => {
    const fast = pass([
      [
        "Thing › renders",
        { 0: observation("passed"), 1: observation("passed") },
      ],
      [
        "Thing › broken",
        { 0: observation("failed", true), 1: observation("failed", true) },
      ],
    ]);
    expect(judgeMutant(1, fast, new Map())).toEqual({
      status: "survived",
      ranBy: 1,
    });
    expect(judgeMutant(2, fast, new Map()).status).toBe("unmeasured");
  });

  it("treats an unobserved failure as unmeasured, not caught", () => {
    const fast = pass([
      [
        "Thing › renders",
        { 0: observation("passed"), 1: observation("failed", false) },
      ],
    ]);
    expect(judgeMutant(1, fast, null).status).toBe("unmeasured");
  });
});

describe("collecting a pass", () => {
  const result = (
    file: string,
    title: string,
    status: string,
    failureMessages: string[] = [],
  ) => ({
    file,
    fullName: `Thing \u203a ${title}`,
    title,
    status,
    failureMessages,
  });
  const wrapper = "/repo/__e2e_verify_Thing_0.unit.spec.tsx";

  it("keys each test by its name without the mutant, and records its spec", () => {
    const { pass, titles, specs } = collectPass(
      [
        result(wrapper, "[m0] renders", "passed"),
        result(wrapper, "[m7] renders", "failed", [
          "expect(received).toBe(expected)",
        ]),
      ],
      new Map([[wrapper, "src/Thing.unit.spec.tsx"]]),
    );
    expect(pass.get("Thing \u203a renders")).toEqual(
      new Map([
        [0, { outcome: "passed", observed: false }],
        [7, { outcome: "failed", observed: true }],
      ]),
    );
    expect(titles.get("Thing \u203a renders")).toBe("renders");
    expect(specs.get("Thing \u203a renders")).toEqual(
      new Set(["src/Thing.unit.spec.tsx"]),
    );
  });

  it("ignores a test with no mutant prefix", () => {
    const { pass } = collectPass(
      [result(wrapper, "renders", "passed")],
      new Map(),
    );
    expect(pass.size).toBe(0);
  });
});

describe("failing pairs for the confirmation pass", () => {
  const observed = { outcome: "failed" as const, observed: true };
  const passed = { outcome: "passed" as const, observed: false };

  it("reruns a mutant only under the spec whose test saw it fail", () => {
    const pass: PassResults = new Map([
      [
        "Thing \u203a renders",
        new Map([
          [0, passed],
          [1, observed],
        ]),
      ],
      [
        "Other \u203a renders",
        new Map([
          [0, passed],
          [2, observed],
        ]),
      ],
    ]);
    const { pairs, titles } = failingPairs({
      pass,
      titles: new Map([
        ["Thing \u203a renders", "renders"],
        ["Other \u203a renders", "renders"],
      ]),
      specs: new Map([
        ["Thing \u203a renders", new Set(["src/Thing.unit.spec.tsx"])],
        ["Other \u203a renders", new Set(["src/Other.unit.spec.tsx"])],
      ]),
    });
    expect(pairs).toEqual(
      new Map([
        ["src/Thing.unit.spec.tsx", new Set([1])],
        ["src/Other.unit.spec.tsx", new Set([2])],
      ]),
    );
    expect(titles).toEqual(["renders"]);
  });

  it("leaves out a mutant that no clean-passing test failed on", () => {
    const pass: PassResults = new Map([
      [
        "Thing \u203a renders",
        new Map([
          [0, passed],
          [1, passed],
        ]),
      ],
      [
        "Thing \u203a broken",
        new Map([
          [0, observed],
          [2, observed],
        ]),
      ],
    ]);
    const { pairs } = failingPairs({
      pass,
      titles: new Map(),
      specs: new Map([
        ["Thing \u203a renders", new Set(["src/Thing.unit.spec.tsx"])],
        ["Thing \u203a broken", new Set(["src/Thing.unit.spec.tsx"])],
      ]),
    });
    expect(pairs.size).toBe(0);
  });
});

describe("coverage index", () => {
  it("strips the runner prefix from product paths", () => {
    expect(
      toRepoRelative(
        "/home/runner/work/metabase/metabase/frontend/src/metabase/a.ts",
      ),
    ).toBe("frontend/src/metabase/a.ts");
    expect(
      toRepoRelative("/x/enterprise/frontend/src/metabase-enterprise/b.tsx"),
    ).toBe("enterprise/frontend/src/metabase-enterprise/b.tsx");
  });

  it("drops functions that most tests fire and matches it titles as a suffix", () => {
    const dir = `${import.meta.dir}/../../../local/claude/e2e-coverage/test-fixture`;
    const fs = require("node:fs") as typeof import("node:fs");
    const shard = `${dir}/shards/coverage-shard-0`;
    fs.mkdirSync(shard, { recursive: true });
    const file =
      "/home/runner/work/metabase/metabase/frontend/src/metabase/a.ts";
    fs.writeFileSync(
      `${shard}/fnmap-1.json`,
      JSON.stringify({
        [file]: { 0: { name: "boot", line: 1 }, 1: { name: "rare", line: 9 } },
      }),
    );
    fs.writeFileSync(
      `${shard}/e2e__test__scenarios__x.cy.spec.ts.json`,
      JSON.stringify({
        spec: "e2e/test/scenarios/x.cy.spec.ts",
        coverage: {},
        tests: [
          {
            title: "x > a does one",
            f: { [file]: { 0: 1, 1: 1 } },
            routes: [],
            pages: [],
          },
          {
            title: "x > a does two",
            f: { [file]: { 0: 1 } },
            routes: [],
            pages: [],
          },
          {
            title: "x > b does one",
            f: { [file]: { 0: 1 } },
            routes: [],
            pages: [],
          },
        ],
      }),
    );
    try {
      const index = buildIndex(
        `${dir}/shards`,
        { runId: "1", sha: "abc" },
        0.5,
      );
      expect(index.totalTests).toBe(3);
      expect(index.boot.map((id) => index.keys[id])).toEqual([
        "frontend/src/metabase/a.ts#1#boot",
      ]);
      expect(index.frequency).toEqual([3, 1]);
      const matches = findTests(
        index,
        "e2e/test/scenarios/x.cy.spec.ts",
        "does one",
      );
      expect(matches.map((test) => test.title)).toEqual([
        "x > a does one",
        "x > b does one",
      ]);
      expect(parseKey(index.keys[matches[0].rare[0]])).toEqual({
        file: "frontend/src/metabase/a.ts",
        line: 9,
        name: "rare",
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("index from the nightly function manifest", () => {
  it("applies the boot threshold and keeps the rare functions per test", () => {
    const index = indexFromManifest(
      {
        builtAt: "abc",
        totalTests: 4,
        keys: ["a#1#boot", "a#9#rare"],
        frequency: [4, 1],
        tests: [{ spec: "x.cy.spec.ts", title: "x does one", fired: [0, 1] }],
      },
      "42",
      0.5,
    );
    expect(index.sha).toBe("abc");
    expect(index.boot).toEqual([0]);
    expect(index.tests[0].rare).toEqual([1]);
  });
});
