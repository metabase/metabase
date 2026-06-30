import { buildNodes } from "./affected-modules";
import { createTestPlan, filterAffectedTests } from "./affected-tests";

const ELEMENTS = [
  { type: "lib/utils", pattern: "src/utils/**" },
  { type: "feature/foo", pattern: "src/foo/**" },
  { type: "feature/bar", pattern: "src/bar/**" },
  { type: "shared/other", pattern: "src/*/**" },
];

const RULES = [
  ...ELEMENTS.map((el) => ({ from: [el.type], allow: [el.type] })),
  { from: ["lib/*"], allow: ["lib/*"] },
  { from: ["feature/*"], allow: ["lib/*"] },
];

const UNIT_FILES = [
  "src/foo/foo.unit.spec.ts",
  "src/foo/bar.unit.spec.ts",
  "src/bar/bar.unit.spec.ts",
  "src/utils/utils.unit.spec.ts",
];
const LOKI_FILES = ["src/foo/Foo.stories.tsx", "src/bar/Bar.stories.tsx"];
const E2E_FILES = ["e2e/test/scenarios/a.cy.spec.ts"];

const baseInput = {
  elements: ELEMENTS,
  rules: RULES,
  fileDependencies: null,
  testFilesBySuite: { unit: UNIT_FILES, loki: LOKI_FILES, e2e: E2E_FILES },
  unitInfraTouched: false,
  lokiInfraTouched: false,
  sharedSourcesTouched: false,
  feFilesChanged: 0,
  beFilesChanged: 0,
};

describe("createTestPlan", () => {
  it("runs only specs in affected modules (rules graph)", () => {
    const plan = createTestPlan({ ...baseInput, changedFiles: ["src/foo/x.ts"] });

    expect(plan.stats.fe_modules_changed).toBe(1);
    expect(plan.stats.fe_modules_affected_rules).toBe(1);
    expect(plan.fe_unit_specs_to_run.sort()).toEqual([
      "src/foo/bar.unit.spec.ts",
      "src/foo/foo.unit.spec.ts",
    ]);
    expect(plan.stats.unit_specs_to_run_rules).toBe(2);
    expect(plan.stats.loki_stories_to_run_rules).toBe(1);
    // With no file deps, usage falls back to rules.
    expect(plan.stats.unit_specs_to_run_usage).toBe(2);
  });

  it("narrows further with the usage graph than the rules graph", () => {
    const plan = createTestPlan({
      ...baseInput,
      changedFiles: ["src/utils/colors.ts"],
      // Only feature/foo actually imports lib/utils.
      fileDependencies: [
        { source: "src/foo/foo.tsx", dependencies: ["src/utils/colors.ts"] },
      ],
    });

    // Rules allow both features to import lib/utils, so both are "affected".
    expect(plan.stats.fe_modules_affected_rules).toBe(3);
    // Usage sees only feature/foo + lib/utils.
    expect(plan.stats.fe_modules_affected_usage).toBe(2);
    expect(plan.stats.unit_specs_to_run_rules).toBe(4);
    expect(plan.stats.unit_specs_to_run_usage).toBe(3);
  });

  it("forces a full FE run on a shared-sources (cljc) change with no affected modules", () => {
    const plan = createTestPlan({
      ...baseInput,
      changedFiles: ["docs/readme.md"],
      sharedSourcesTouched: true,
    });

    expect(plan.stats.fe_modules_affected_rules).toBe(0);
    expect(plan.stats.unit_specs_to_run_rules).toBe(UNIT_FILES.length);
    expect(plan.stats.unit_specs_to_run_usage).toBe(UNIT_FILES.length);
    expect(plan.stats.loki_stories_to_run_rules).toBe(LOKI_FILES.length);
  });

  it("forces only the suite whose infra changed", () => {
    const plan = createTestPlan({
      ...baseInput,
      changedFiles: ["docs/readme.md"],
      unitInfraTouched: true,
    });

    expect(plan.stats.unit_specs_to_run_rules).toBe(UNIT_FILES.length);
    expect(plan.stats.loki_stories_to_run_rules).toBe(0);
  });

  it("always runs the full e2e suite", () => {
    const plan = createTestPlan({ ...baseInput, changedFiles: ["src/foo/x.ts"] });

    expect(plan.stats.e2e_specs_to_run_rules).toBe(E2E_FILES.length);
    expect(plan.stats.e2e_specs_to_run_usage).toBe(E2E_FILES.length);
    expect(plan.e2e_specs_to_run).toEqual(E2E_FILES);
  });

  it("passes the FE/BE file counts through to stats", () => {
    const plan = createTestPlan({
      ...baseInput,
      changedFiles: [],
      feFilesChanged: 5,
      beFilesChanged: 3,
    });

    expect(plan.stats.fe_files_changed).toBe(5);
    expect(plan.stats.be_files_changed).toBe(3);
  });
});

describe("filterAffectedTests", () => {
  it("keeps only tests inside affected modules", () => {
    const nodes = buildNodes(ELEMENTS);
    const affected = new Set(["feature/foo", "lib/utils"]);
    const tests = [
      "src/foo/foo.unit.spec.ts",
      "src/utils/colors.unit.spec.ts",
      "src/bar/bar.unit.spec.ts",
      "docs/unrelated.unit.spec.ts",
    ];
    expect(filterAffectedTests(nodes, affected, tests)).toEqual([
      "src/foo/foo.unit.spec.ts",
      "src/utils/colors.unit.spec.ts",
    ]);
  });
});
