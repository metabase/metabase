import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
  colocatedSpecs,
  mutantOf,
  pairSpecsWithMutants,
  parseCoverageMap,
  parseProgress,
  stripMutant,
  wrapperPath,
  wrapperSource,
} from "./verify/jest";
import {
  CLEAN_RERUN_NOTE,
  type PassResults,
  classifyFailure,
  collectPass,
  failingPairs,
  judgeMutant,
} from "./verify/judge";
import { mapLine, parseDeletedTests, parseHunks } from "./verify/lines";
import {
  type MutantPlan,
  applySchemata,
  dealMutants,
  functionAtLine,
  mutantsForFunction,
  parseSource,
} from "./verify/mutants";
import { type VerifyReport, renderMarkdown } from "./verify/report";

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

const withIds = (plans: MutantPlan[]) =>
  plans.map((plan, index) => ({ ...plan, id: index + 1 }));

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
    const mutants = mutantsForFunction(
      sourceFile,
      "Panel.tsx",
      fn,
      "Panel",
      10,
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
      mutantsForFunction(sourceFile, "Panel.tsx", fn, "Panel", 2),
    ).toHaveLength(2);
  });

  it("mutates an expression-bodied arrow function's result", () => {
    const fn = functionAtLine(sourceFile, 11);
    if (!fn) {
      throw new Error("function not found");
    }
    const plans = mutantsForFunction(sourceFile, "Panel.tsx", fn, "helper", 4);
    expect(plans[0].kind).toBe("return-undefined");
    const mutants = withIds(plans);
    expect(applySchemata(SOURCE, mutants)).toContain(
      "(globalThis.__E2E_MUTANT__ === 1 ? undefined : (value.toUpperCase()))",
    );
  });

  it("produces schemata that still compile and keep the original when the switch is off", () => {
    const fn = functionAtLine(sourceFile, 3);
    if (!fn) {
      throw new Error("function not found");
    }
    const mutants = withIds(
      mutantsForFunction(sourceFile, "Panel.tsx", fn, "Panel", 10),
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

describe("the shapes a dropped e2e assertion hides behind", () => {
  const HOOK = `
export function useThing(isPolling) {
  const { data, isLoading } = useQuery();
  const [ack] = useAckMutation();
  const [ackAll] = useAckAllMutation();
  return {
    data: data?.rows ?? [],
    isLoading,
    ack,
    ackAll,
  };
}
`;

  it("mutates each property of a returned object, pass-throughs first", () => {
    const sourceFile = parseSource("use-thing.ts", HOOK);
    const fn = functionAtLine(sourceFile, 2);
    if (!fn) {
      throw new Error("function not found");
    }
    const plans = mutantsForFunction(
      sourceFile,
      "use-thing.ts",
      fn,
      "useThing",
      4,
    );
    expect(plans.map((plan) => [plan.kind, plan.description])).toEqual([
      ["object-property-undefined", "property `isLoading` becomes undefined"],
      ["object-property-undefined", "property `ack` becomes undefined"],
      ["object-property-undefined", "property `ackAll` becomes undefined"],
      ["object-property-undefined", "property `data` becomes undefined"],
    ]);
  });

  const NAVBAR = `
export function Navbar({ currentPath }) {
  return (
    <nav>
      {PLUGIN.isEnabled && (
        <PLUGIN.NavItem currentPath={currentPath} />
      )}
    </nav>
  );
}
`;

  it("mutates a JSX element that renders behind a logical and", () => {
    const sourceFile = parseSource("Navbar.tsx", NAVBAR);
    const fn = functionAtLine(sourceFile, 2);
    if (!fn) {
      throw new Error("function not found");
    }
    const plans = mutantsForFunction(sourceFile, "Navbar.tsx", fn, "Navbar", 6);
    const andPlan = plans.find((plan) => plan.kind === "jsx-and-false");
    expect(andPlan?.description).toBe(
      "`PLUGIN.isEnabled && …` renders nothing",
    );
    const output = applySchemata(NAVBAR, withIds(plans));
    expect(output).toContain("? false : (PLUGIN.isEnabled && (");
    const compiled = ts.transpileModule(output, {
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        target: ts.ScriptTarget.ES2020,
      },
      reportDiagnostics: true,
    });
    expect(compiled.diagnostics ?? []).toHaveLength(0);
  });
});

describe("dealing mutants within the budget", () => {
  const plansFor = (count: number): MutantPlan[] =>
    Array.from({ length: count }, (_, index) => ({
      file: "a.ts",
      functionLine: 1,
      functionName: "fn",
      kind: "return-undefined" as const,
      line: index + 1,
      start: index,
      end: index + 1,
      description: `plan ${index}`,
      statement: false,
      replacement: "undefined",
    }));

  it("gives every function one mutant before any function gets a second", () => {
    const dealt = dealMutants(
      [
        ["a", plansFor(4)],
        ["b", plansFor(4)],
        ["c", plansFor(4)],
      ],
      4,
      5,
    );
    expect(dealt.map(([key, mutants]) => [key, mutants.length])).toEqual([
      ["a", 2],
      ["b", 2],
      ["c", 1],
    ]);
  });

  it("numbers the mutants it keeps from one", () => {
    const dealt = dealMutants(
      [
        ["a", plansFor(2)],
        ["b", plansFor(2)],
      ],
      2,
      3,
    );
    expect(dealt.flatMap(([, mutants]) => mutants.map((m) => m.id))).toEqual([
      1, 3, 2,
    ]);
  });

  it("reaches a shared function in the first round, rarest first", () => {
    const advisory = "advisory at 0.2%";
    const navbar = "navbar at 11.3%";
    const dealt = dealMutants(
      [
        [advisory, plansFor(4)],
        [navbar, plansFor(4)],
      ],
      4,
      3,
    );
    expect(dealt.map(([key, mutants]) => [key, mutants.length])).toEqual([
      [advisory, 2],
      [navbar, 1],
    ]);
  });

  it("numbers from a given starting id", () => {
    const dealt = dealMutants([["a", plansFor(2)]], 2, 10, 7);
    expect(dealt[0][1].map((m) => m.id)).toEqual([7, 8]);
  });

  it("leaves out a function once the budget is gone", () => {
    const dealt = dealMutants(
      [
        ["a", plansFor(1)],
        ["b", plansFor(1)],
      ],
      4,
      1,
    );
    expect(dealt.map(([key]) => key)).toEqual(["a"]);
  });

  it("stops at the plans a function has", () => {
    const dealt = dealMutants(
      [
        ["a", plansFor(1)],
        ["b", plansFor(3)],
      ],
      4,
      100,
    );
    expect(dealt.map(([key, mutants]) => [key, mutants.length])).toEqual([
      ["a", 1],
      ["b", 3],
    ]);
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
  const WRAPPER = "/repo/__e2e_verify_Thing_0.unit.spec.tsx";
  const SPEC = "src/Thing.unit.spec.tsx";
  const pass = (
    rows: [string, Record<number, ReturnType<typeof observation>>][],
  ): PassResults =>
    new Map(
      rows.map(([name, byMutant]) => {
        const entries = Object.entries(byMutant).map(
          ([id, value]) => [Number(id), value] as const,
        );
        const clean = entries.find(([id]) => id === 0)?.[1];
        return [
          name,
          {
            byMutant: new Map(
              entries
                .filter(([id]) => id !== 0)
                .map(([id, obs]) => [
                  id,
                  [{ observation: obs, file: WRAPPER, spec: SPEC }],
                ]),
            ),
            clean: new Map(clean ? [[WRAPPER, clean]] : []),
          },
        ];
      }),
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

  it("names the test whose failed clean rerun voided a mutant", () => {
    const fast = pass([
      [
        "Thing \u203a renders",
        { 0: observation("passed"), 1: observation("failed", true) },
      ],
    ]);
    const flaky = pass([
      [
        "Thing \u203a renders",
        { 0: observation("failed", true), 1: observation("failed", true) },
      ],
    ]);
    const verdict = judgeMutant(1, fast, flaky);
    expect(verdict).toEqual({
      status: "unmeasured",
      reason: `Thing \u203a renders: ${CLEAN_RERUN_NOTE}`,
      cleanRerunTests: ["Thing \u203a renders"],
    });
  });

  it("judges a mutant against the clean run of its own wrapper file", () => {
    // Each spec gets one wrapper file per --wrappers, and every one runs the
    // clean variant. An unstable clean run in one file must not void a mutant
    // that another file witnessed.
    const steady = "/repo/__e2e_verify_Thing_0.unit.spec.tsx";
    const flaky = "/repo/__e2e_verify_Thing_1.unit.spec.tsx";
    const withTwoWrappers = (): PassResults =>
      new Map([
        [
          "Thing \u203a renders",
          {
            byMutant: new Map([
              [
                1,
                [
                  {
                    observation: observation("failed", true),
                    file: steady,
                    spec: SPEC,
                  },
                ],
              ],
            ]),
            clean: new Map([
              [steady, observation("passed")],
              [flaky, observation("failed", true)],
            ]),
          },
        ],
      ]);

    expect(judgeMutant(1, withTwoWrappers(), withTwoWrappers())).toEqual({
      status: "caught",
      by: ["Thing \u203a renders"],
    });
  });

  it("leaves the voiding tests off a verdict no rerun broke", () => {
    const fast = pass([
      [
        "Thing \u203a renders",
        { 0: observation("passed"), 1: observation("failed", false) },
      ],
    ]);
    const verdict = judgeMutant(1, fast, null);
    expect(verdict.status).toBe("unmeasured");
    expect(
      verdict.status === "unmeasured" ? verdict.cleanRerunTests : [],
    ).toBeUndefined();
  });
});

describe("the clean-rerun warning in the report", () => {
  const report = (
    cleanRerunWarning: VerifyReport["cleanRerunWarning"],
  ): VerifyReport => ({
    runId: "1",
    sha: "abcdef1234",
    unitSpecs: ["a.unit.spec.tsx"],
    mutantCount: 2,
    cleanRerunWarning,
    tests: [],
  });

  it("leads with the voided count and the test names", () => {
    const markdown = renderMarkdown(
      report({ tests: ["Thing \u203a renders"], mutants: 89 }),
    );
    expect(markdown).toContain("1 test(s) failed their clean rerun");
    expect(markdown).toContain("voided 89 mutant verdict(s)");
    expect(markdown).toContain("Thing \u203a renders");
  });

  it("says nothing when every rerun was clean", () => {
    expect(renderMarkdown(report(undefined))).not.toContain("clean rerun");
    expect(renderMarkdown(report({ tests: [], mutants: 0 }))).not.toContain(
      "clean rerun",
    );
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
    const { pass, titles } = collectPass(
      [
        result(wrapper, "[m0] renders", "passed"),
        result(wrapper, "[m7] renders", "failed", [
          "expect(received).toBe(expected)",
        ]),
      ],
      new Map([[wrapper, "src/Thing.unit.spec.tsx"]]),
    );
    const run = pass.get("Thing \u203a renders");
    expect(run?.clean).toEqual(
      new Map([[wrapper, { outcome: "passed", observed: false }]]),
    );
    expect(run?.byMutant.get(7)).toEqual([
      {
        observation: { outcome: "failed", observed: true },
        file: wrapper,
        spec: "src/Thing.unit.spec.tsx",
      },
    ]);
    expect(titles.get("Thing \u203a renders")).toBe("renders");
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
  const run = (
    file: string,
    spec: string,
    clean: typeof passed,
    mutants: [number, typeof observed][],
  ) => ({
    byMutant: new Map(
      mutants.map(([id, observation]) => [id, [{ observation, file, spec }]]),
    ),
    clean: new Map([[file, clean]]),
  });

  it("reruns a mutant only under the spec whose test saw it fail", () => {
    const pass: PassResults = new Map([
      [
        "Thing \u203a renders",
        run("/w/thing_0.unit.spec.tsx", "src/Thing.unit.spec.tsx", passed, [
          [1, observed],
        ]),
      ],
      [
        "Other \u203a renders",
        run("/w/other_0.unit.spec.tsx", "src/Other.unit.spec.tsx", passed, [
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
    });
    expect(pairs).toEqual(
      new Map([
        ["src/Thing.unit.spec.tsx", new Set([1])],
        ["src/Other.unit.spec.tsx", new Set([2])],
      ]),
    );
    expect(titles).toEqual(["renders"]);
  });

  it("leaves out a mutant whose own wrapper file failed its clean run", () => {
    const pass: PassResults = new Map([
      [
        "Thing \u203a renders",
        run("/w/thing_0.unit.spec.tsx", "src/Thing.unit.spec.tsx", passed, [
          [1, passed],
        ]),
      ],
      [
        "Thing \u203a broken",
        run("/w/thing_1.unit.spec.tsx", "src/Thing.unit.spec.tsx", observed, [
          [2, observed],
        ]),
      ],
    ]);
    const { pairs } = failingPairs({ pass, titles: new Map() });
    expect(pairs.size).toBe(0);
  });
});

describe("colocated unit specs", () => {
  const onDisk = new Set([
    "src/thing/Thing.unit.spec.tsx",
    "src/thing/utils.unit.spec.ts",
  ]);
  const exists = (file: string) => onDisk.has(file);

  it("pairs each product file with the spec beside it", () => {
    expect(
      colocatedSpecs(["src/thing/Thing.tsx", "src/thing/utils.ts"], exists),
    ).toEqual([
      "src/thing/Thing.unit.spec.tsx",
      "src/thing/utils.unit.spec.ts",
    ]);
  });

  it("skips a file with no spec beside it, and specs themselves", () => {
    expect(
      colocatedSpecs(
        ["src/thing/Other.tsx", "src/thing/Thing.unit.spec.tsx"],
        exists,
      ),
    ).toEqual([]);
  });

  it("returns each spec once", () => {
    expect(
      colocatedSpecs(["src/thing/Thing.tsx", "src/thing/Thing.tsx"], exists),
    ).toEqual(["src/thing/Thing.unit.spec.tsx"]);
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

describe("progress from a killed pass", () => {
  const row = (title: string, status: string) =>
    JSON.stringify({
      file: "/repo/a/__e2e_verify_a_0.unit.spec.tsx",
      fullName: `A \u203a ${title}`,
      title,
      status,
      failureMessages: status === "failed" ? ["expect(1).toBe(2)"] : [],
    });

  const write = (contents: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-progress-"));
    const file = path.join(dir, "progress.ndjson");
    fs.writeFileSync(file, contents);
    return file;
  };

  it("reads the lines a killed pass already wrote", () => {
    const results = parseProgress(
      write(
        `${row("[m0] renders", "passed")}\n${row("[m1] renders", "failed")}\n`,
      ),
    );
    expect(results.map(({ title, status }) => [title, status])).toEqual([
      ["[m0] renders", "passed"],
      ["[m1] renders", "failed"],
    ]);
    expect(results[1].failureMessages).toEqual(["expect(1).toBe(2)"]);
  });

  it("keeps the whole lines when a kill cut the last one in half", () => {
    const results = parseProgress(
      write(`${row("[m0] renders", "passed")}\n{"file":"/repo/a/__e`),
    );
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("[m0] renders");
  });

  it("reports nothing when the pass died before any test finished", () => {
    expect(parseProgress(write(""))).toEqual([]);
    expect(parseProgress("/no/such/progress.ndjson")).toEqual([]);
  });
});

describe("the pass-timeout warning in the report", () => {
  const report = (passTimedOut?: boolean): VerifyReport => ({
    runId: "1",
    sha: "abcdef1234",
    unitSpecs: ["a.unit.spec.tsx"],
    mutantCount: 2,
    passTimedOut,
    tests: [],
  });

  it("says the rows are only what finished", () => {
    const markdown = renderMarkdown(report(true));
    expect(markdown).toContain("hit `--pass-timeout`");
    expect(markdown).toContain("finished first");
  });

  it("says nothing when no pass was killed", () => {
    expect(renderMarkdown(report(false))).not.toContain("--pass-timeout");
    expect(renderMarkdown(report(undefined))).not.toContain("--pass-timeout");
  });
});

describe("pairing specs with the mutants they can observe", () => {
  const mutant = (id: number, file: string) =>
    ({ id, file, line: 1, kind: "return-undefined", description: "" }) as never;
  const byFile = new Map([
    ["src/help.ts", [mutant(1, "src/help.ts"), mutant(2, "src/help.ts")]],
    ["src/logo.ts", [mutant(3, "src/logo.ts")]],
  ]);
  const specs = [
    "help.unit.spec.tsx",
    "logo.unit.spec.tsx",
    "far.unit.spec.tsx",
  ];
  const specsByFile = new Map([
    ["src/help.ts", new Set(["help.unit.spec.tsx"])],
    ["src/logo.ts", new Set(["logo.unit.spec.tsx", "help.unit.spec.tsx"])],
  ]);

  it("gives each spec only the mutants in files it loaded", () => {
    const pairs = pairSpecsWithMutants(byFile, specs, specsByFile, true);
    expect(pairs.get("help.unit.spec.tsx")).toEqual([1, 2, 3]);
    expect(pairs.get("logo.unit.spec.tsx")).toEqual([3]);
    // A spec that loaded nothing in scope cannot observe anything, so it is
    // left out of the run rather than given an empty wrapper.
    expect(pairs.has("far.unit.spec.tsx")).toBe(false);
  });

  it("falls back to every pair when pruning is off", () => {
    const pairs = pairSpecsWithMutants(byFile, specs, specsByFile, false);
    expect(pairs.size).toBe(3);
    for (const spec of specs) {
      expect(pairs.get(spec)).toEqual([1, 2, 3]);
    }
  });

  it("drops every spec when the coverage map came back empty", () => {
    // Better to report `no test ran it on clean code` than to spend a pass on
    // pairs that measurement says cannot matter.
    expect(pairSpecsWithMutants(byFile, specs, new Map(), true).size).toBe(0);
  });
});

describe("the per-spec coverage map", () => {
  const write = (contents: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-covmap-"));
    const file = path.join(dir, "spec-files.ndjson");
    fs.writeFileSync(file, contents);
    return file;
  };

  it("inverts absolute per-spec lines into repo-relative files to specs", () => {
    const file = write(
      [
        JSON.stringify({
          spec: "/repo/a/a.unit.spec.tsx",
          files: ["/repo/src/help.ts", "/repo/src/logo.ts"],
        }),
        JSON.stringify({
          spec: "/repo/b/b.unit.spec.tsx",
          files: ["/repo/src/help.ts"],
        }),
        JSON.stringify({ spec: "/repo/c/c.unit.spec.tsx", files: [] }),
        "",
      ].join("\n"),
    );
    const map = parseCoverageMap("/repo", file);
    expect([...(map.get("src/help.ts") ?? [])].sort()).toEqual([
      "a/a.unit.spec.tsx",
      "b/b.unit.spec.tsx",
    ]);
    expect([...(map.get("src/logo.ts") ?? [])]).toEqual(["a/a.unit.spec.tsx"]);
    expect(map.has("src/nothing.ts")).toBe(false);
  });

  it("keeps the whole lines when the file is truncated or missing", () => {
    const file = write(
      `${JSON.stringify({ spec: "/repo/a.unit.spec.tsx", files: ["/repo/src/help.ts"] })}\n{"spec":"/repo/b`,
    );
    expect([
      ...(parseCoverageMap("/repo", file).get("src/help.ts") ?? []),
    ]).toEqual(["a.unit.spec.tsx"]);
    expect(parseCoverageMap("/repo", "/no/such/file.ndjson").size).toBe(0);
  });
});
