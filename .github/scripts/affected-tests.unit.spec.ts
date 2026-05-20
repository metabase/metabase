import { buildModuleGraph } from "./affected-modules";
import {
  createTestPlan,
  createTestPlanForSuite,
  filterAffectedTests,
} from "./affected-tests";

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

const TEST_SUITE_DEFS = {
  unit: { statsPrefix: "fe_unit_specs" },
  loki: { statsPrefix: "loki_stories" },
  e2e: { statsPrefix: "e2e_specs", runAllTests: true },
};

const UNIT_FILES = [
  "src/foo/foo.unit.spec.ts",
  "src/foo/bar.unit.spec.ts",
  "src/bar/bar.unit.spec.ts",
  "src/utils/utils.unit.spec.ts",
];
const LOKI_FILES = ["src/foo/Foo.stories.tsx", "src/bar/Bar.stories.tsx"];
const E2E_FILES = ["e2e/test/scenarios/a.cy.spec.ts"];

const moduleGraph = buildModuleGraph(ELEMENTS, RULES);

describe("affected tests", () => {
  describe("createTestPlanForSuite", () => {
    it("should run all tests when infra is touched", () => {
      const result = createTestPlanForSuite(
        moduleGraph,
        TEST_SUITE_DEFS.unit,
        true, // infraTouched
        ["src/foo/x.ts"],
        UNIT_FILES,
      );
      expect(result).toEqual(UNIT_FILES);
    });

    it("should fall back to affected-tests filtering when infra not touched", () => {
      const result = createTestPlanForSuite(
        moduleGraph,
        TEST_SUITE_DEFS.unit,
        false, // infraTouched
        ["src/foo/x.ts"],
        UNIT_FILES,
      );
      expect(result.sort()).toEqual([
        "src/foo/bar.unit.spec.ts",
        "src/foo/foo.unit.spec.ts",
      ]);
    });

    it("should return nothing when infra not touched and no file maps to a module", () => {
      const result = createTestPlanForSuite(
        moduleGraph,
        TEST_SUITE_DEFS.unit,
        false,
        ["docs/foo.md"],
        UNIT_FILES,
      );
      expect(result).toEqual([]);
    });

    it("should run all tests for runAllTests suites regardless of inputs", () => {
      expect(
        createTestPlanForSuite(
          moduleGraph,
          TEST_SUITE_DEFS.e2e,
          false,
          ["docs/foo.md"],
          E2E_FILES,
        ),
      ).toEqual(E2E_FILES);
      expect(
        createTestPlanForSuite(
          moduleGraph,
          TEST_SUITE_DEFS.e2e,
          false,
          ["src/foo/x.ts"],
          E2E_FILES,
        ),
      ).toEqual(E2E_FILES);
    });
  });

  describe("createTestPlan", () => {
    it("should return run lists and stats together", () => {
      const result = createTestPlan({
        elements: ELEMENTS,
        rules: RULES,
        testSuites: TEST_SUITE_DEFS,
        changedFiles: ["src/foo/x.ts"],
        testFilesBySuite: {
          unit: UNIT_FILES,
          loki: LOKI_FILES,
          e2e: E2E_FILES,
        },
        infraTouchedBySuite: { unit: false, loki: false, e2e: false },
      });

      expect(result.fe_unit_specs_to_run.sort()).toEqual([
        "src/foo/bar.unit.spec.ts",
        "src/foo/foo.unit.spec.ts",
      ]);
      expect(result.loki_stories_to_run).toEqual(["src/foo/Foo.stories.tsx"]);
      expect(result.e2e_specs_to_run).toEqual(E2E_FILES);

      expect(result.stats).toEqual({
        modules_changed: 1,
        modules_affected: 1,
        modules_affected_list: ["feature/foo"],
        fe_unit_specs_total: 4,
        fe_unit_specs_run: 2,
        fe_unit_specs_skipped: 2,
        loki_stories_total: 2,
        loki_stories_run: 1,
        loki_stories_skipped: 1,
        e2e_specs_total: 1,
        e2e_specs_run: 1,
        e2e_specs_skipped: 0,
      });
    });

    it("should run all unit specs when unit infra is touched", () => {
      const result = createTestPlan({
        elements: ELEMENTS,
        rules: RULES,
        testSuites: TEST_SUITE_DEFS,
        changedFiles: ["docs/foo.md"],
        testFilesBySuite: {
          unit: UNIT_FILES,
          loki: LOKI_FILES,
          e2e: E2E_FILES,
        },
        infraTouchedBySuite: { unit: true, loki: false, e2e: false },
      });
      expect(result.stats.fe_unit_specs_run).toBe(UNIT_FILES.length);
      expect(result.stats.fe_unit_specs_skipped).toBe(0);
      // Only the unit suite was triggered.
      expect(result.stats.loki_stories_run).toBe(0);
    });

    it("should not run anything when no infra is touched and no modules affected", () => {
      const result = createTestPlan({
        elements: ELEMENTS,
        rules: RULES,
        testSuites: TEST_SUITE_DEFS,
        changedFiles: ["docs/foo.md"],
        testFilesBySuite: {
          unit: UNIT_FILES,
          loki: LOKI_FILES,
          e2e: E2E_FILES,
        },
        infraTouchedBySuite: { unit: false, loki: false, e2e: false },
      });
      expect(result.stats.fe_unit_specs_run).toBe(0);
      expect(result.stats.loki_stories_run).toBe(0);
      // e2e is runAllTests, so it still reports run = total.
      expect(result.stats.e2e_specs_run).toBe(E2E_FILES.length);
    });
  });

  describe("filterAffectedTests", () => {
    it("should keep only tests inside affected modules", () => {
      const affected = new Set(["feature/foo", "lib/utils"]);
      const tests = [
        "src/foo/foo.unit.spec.ts",
        "src/utils/colors.unit.spec.ts",
        "src/bar/bar.unit.spec.ts",
        "docs/unrelated.unit.spec.ts",
      ];
      expect(filterAffectedTests(moduleGraph, affected, tests)).toEqual([
        "src/foo/foo.unit.spec.ts",
        "src/utils/colors.unit.spec.ts",
      ]);
    });
  });
});
