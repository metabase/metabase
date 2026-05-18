// Per-suite affected-tests logic: combines module-affected closure with
// per-suite "infra-touched" booleans (computed by dorny/paths-filter against
// the `frontend_unit_infra` / `frontend_loki_infra` anchors in file-paths.yaml).
// When infra files change, the whole suite runs in full.

import {
  type ModuleDef,
  type ModuleGraph,
  type Rule,
  buildModuleGraph,
  getAffectedModules,
  getChangedModules,
  mapFileToModule,
} from "./affected-modules";

export type TestSuiteDef = {
  statsPrefix: string;
  runAllTests?: boolean;
};

export type TestPlanStats = {
  modules_changed: number;
  modules_affected: number;
  modules_affected_list: string[];
  fe_unit_specs_total: number;
  fe_unit_specs_run: number;
  fe_unit_specs_skipped: number;
  loki_stories_total: number;
  loki_stories_run: number;
  loki_stories_skipped: number;
  e2e_specs_total: number;
  e2e_specs_run: number;
  e2e_specs_skipped: number;
};

export type TestPlan = {
  stats: TestPlanStats;
  fe_unit_specs_to_run: string[];
  loki_stories_to_run: string[];
  e2e_specs_to_run: string[];
};

export const TEST_SUITES = {
  unit: {
    statsPrefix: "fe_unit_specs",
  },
  loki: {
    statsPrefix: "loki_stories",
  },
  e2e: {
    statsPrefix: "e2e_specs",
    // We don't map changed files to e2e tests yet, so for now just run them all
    runAllTests: true,
  },
} satisfies Record<string, TestSuiteDef>;

export function createTestPlan({
  elements,
  rules,
  testSuites,
  changedFiles,
  testFilesBySuite,
  infraTouchedBySuite,
}: {
  elements: ModuleDef[];
  rules: Rule[];
  testSuites: Record<string, TestSuiteDef>;
  changedFiles: string[];
  testFilesBySuite: Record<string, string[]>;
  infraTouchedBySuite: Record<string, boolean>;
}): TestPlan {
  const moduleGraph = buildModuleGraph(elements, rules);

  const changedModules = getChangedModules(moduleGraph, changedFiles);
  const affectedModules = getAffectedModules(moduleGraph, changedFiles);
  const modulesAffectedList = [...affectedModules].sort();

  const specsToRun: Record<string, string[]> = {};
  const stats: Record<string, number | string[]> = {
    modules_changed: changedModules.size,
    modules_affected: affectedModules.size,
    modules_affected_list: modulesAffectedList,
  };

  for (const [name, testSuite] of Object.entries(testSuites)) {
    const files = testFilesBySuite[name] ?? [];
    const tests = createTestPlanForSuite(
      moduleGraph,
      testSuite,
      infraTouchedBySuite[name] ?? false,
      changedFiles,
      files,
    );
    specsToRun[name] = tests;
    stats[`${testSuite.statsPrefix}_total`] = files.length;
    stats[`${testSuite.statsPrefix}_run`] = tests.length;
    stats[`${testSuite.statsPrefix}_skipped`] = files.length - tests.length;
  }

  return {
    stats: stats as TestPlanStats,
    fe_unit_specs_to_run: specsToRun.unit ?? [],
    loki_stories_to_run: specsToRun.loki ?? [],
    e2e_specs_to_run: specsToRun.e2e ?? [],
  };
}

/**
 * Computes the test plan for one test suite
 *
 * Runs the full suite when `runAllTests` is set or `infraTouched` is true,
 * otherwise runs the tests based on affected-modules.
 */
export function createTestPlanForSuite(
  moduleGraph: ModuleGraph,
  testSuite: TestSuiteDef,
  infraTouched: boolean,
  changedFiles: string[],
  allTestFiles: string[],
): string[] {
  if (testSuite.runAllTests || infraTouched) {
    return allTestFiles;
  }
  const affected = getAffectedModules(moduleGraph, changedFiles);
  return filterAffectedTests(moduleGraph, affected, allTestFiles);
}

/**
 * Filters the test-file list down to tests whose owning module is affected.
 */
export function filterAffectedTests(
  moduleGraph: ModuleGraph,
  affected: Set<string>,
  testFiles: string[],
): string[] {
  return testFiles.filter((file) => {
    const module = mapFileToModule(moduleGraph, file);
    return module !== null && affected.has(module);
  });
}
