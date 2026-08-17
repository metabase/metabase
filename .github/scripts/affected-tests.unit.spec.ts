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
  e2eSpecFiles: null,
  unitInfraTouched: false,
  lokiInfraTouched: false,
  e2eInfraTouched: false,
  sharedSourcesTouched: false,
  feFilesChanged: 0,
  beFilesChanged: 0,
  feFilesTotal: 0,
  beFilesTotal: 0,
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

  it("runs the full e2e suite when no coverage manifest is available", () => {
    const plan = createTestPlan({ ...baseInput, changedFiles: ["src/foo/x.ts"] });

    expect(plan.stats.e2e_specs_to_run_rules).toBe(E2E_FILES.length);
    expect(plan.stats.e2e_specs_to_run_usage).toBe(E2E_FILES.length);
    expect(plan.e2e_specs_to_run).toEqual(E2E_FILES);
  });

  it("narrows e2e to specs covering affected feature modules", () => {
    const e2e = [
      "e2e/test/scenarios/foo.cy.spec.ts",
      "e2e/test/scenarios/bar.cy.spec.ts",
      "e2e/test/scenarios/new.cy.spec.ts",
    ];
    const plan = createTestPlan({
      ...baseInput,
      changedFiles: ["src/foo/x.ts"], // affects feature/foo only
      testFilesBySuite: { unit: UNIT_FILES, loki: LOKI_FILES, e2e },
      e2eSpecFiles: {
        "e2e/test/scenarios/foo.cy.spec.ts": ["src/foo/a.ts"], // feature/foo
        "e2e/test/scenarios/bar.cy.spec.ts": ["src/bar/b.ts"], // feature/bar
        // new.cy.spec.ts intentionally absent from the manifest
      },
    });

    // foo's feature module is affected; bar's is not; the unmapped new spec
    // always runs.
    expect(plan.e2e_specs_to_run.sort()).toEqual([
      "e2e/test/scenarios/foo.cy.spec.ts",
      "e2e/test/scenarios/new.cy.spec.ts",
    ]);
    expect(plan.stats.e2e_specs_all).toBe(3);
  });

  it("runs a spec that maps to no feature module (unknown scope)", () => {
    const e2e = ["e2e/test/scenarios/lib-only.cy.spec.ts"];
    const plan = createTestPlan({
      ...baseInput,
      changedFiles: ["src/foo/x.ts"], // affects feature/foo, NOT lib/utils
      testFilesBySuite: { unit: UNIT_FILES, loki: LOKI_FILES, e2e },
      e2eSpecFiles: {
        // Covers only a non-feature module (e.g. a home/auth spec whose feature
        // the baseline subtracted), so its feature scope is unknown.
        "e2e/test/scenarios/lib-only.cy.spec.ts": ["src/utils/colors.ts"],
      },
    });

    // No feature module to gate on -> can't bound scope -> always runs.
    expect(plan.e2e_specs_to_run).toEqual(e2e);
  });

  it("force-runs all e2e on a backend change (invisible to FE coverage)", () => {
    const e2e = ["e2e/test/scenarios/foo.cy.spec.ts"];
    const plan = createTestPlan({
      ...baseInput,
      changedFiles: ["src/metabase/api/card.clj"],
      beFilesChanged: 1,
      testFilesBySuite: { unit: UNIT_FILES, loki: LOKI_FILES, e2e },
      e2eSpecFiles: { "e2e/test/scenarios/bar.cy.spec.ts": ["src/bar/b.ts"] },
    });

    expect(plan.e2e_specs_to_run).toEqual(e2e);
  });

  it("force-runs all e2e when e2e infra (support/runner) changes", () => {
    const e2e = ["e2e/test/scenarios/foo.cy.spec.ts"];
    const plan = createTestPlan({
      ...baseInput,
      changedFiles: ["e2e/support/commands/api/createQuestion.js"],
      e2eInfraTouched: true,
      testFilesBySuite: { unit: UNIT_FILES, loki: LOKI_FILES, e2e },
      e2eSpecFiles: { "e2e/test/scenarios/bar.cy.spec.ts": ["src/bar/b.ts"] },
    });

    expect(plan.e2e_specs_to_run).toEqual(e2e);
  });

  it("runs an edited spec even when no app module changed", () => {
    const spec = "e2e/test/scenarios/foo.cy.spec.ts";
    const e2e = [spec, "e2e/test/scenarios/bar.cy.spec.ts"];
    const plan = createTestPlan({
      ...baseInput,
      changedFiles: [spec], // only the spec itself changed
      testFilesBySuite: { unit: UNIT_FILES, loki: LOKI_FILES, e2e },
      e2eSpecFiles: {
        [spec]: ["src/bar/b.ts"], // covers feature/bar, which is NOT affected
        "e2e/test/scenarios/bar.cy.spec.ts": ["src/bar/b.ts"],
      },
    });

    // No module is affected, but the edited spec must still run.
    expect(plan.e2e_specs_to_run).toEqual([spec]);
  });

  it("runs a spec whose coverage was fully baseline-subtracted (empty files)", () => {
    const e2e = ["e2e/test/scenarios/empty.cy.spec.ts"];
    const plan = createTestPlan({
      ...baseInput,
      changedFiles: ["src/foo/x.ts"], // affects feature/foo
      testFilesBySuite: { unit: UNIT_FILES, loki: LOKI_FILES, e2e },
      e2eSpecFiles: { "e2e/test/scenarios/empty.cy.spec.ts": [] },
    });

    // Empty coverage means unknown scope, so the spec runs.
    expect(plan.e2e_specs_to_run).toEqual(e2e);
  });

  it("forces a full e2e run when shared (cljc) sources change", () => {
    const e2e = ["e2e/test/scenarios/foo.cy.spec.ts"];
    const plan = createTestPlan({
      ...baseInput,
      changedFiles: ["src/foo/x.ts"],
      sharedSourcesTouched: true,
      testFilesBySuite: { unit: UNIT_FILES, loki: LOKI_FILES, e2e },
      e2eSpecFiles: { "e2e/test/scenarios/bar.cy.spec.ts": ["src/bar/b.ts"] },
    });

    // Manifest is present but cljc is invisible to JS coverage, so run all.
    expect(plan.e2e_specs_to_run).toEqual(e2e);
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
