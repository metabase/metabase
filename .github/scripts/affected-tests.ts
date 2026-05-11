// Per-suite affected-tests logic: combines module-affected closure with
// per-suite "infra-file" patterns that force a full-suite run when changed.
// Mirrors the relevant subset of `.github/file-paths.yaml`'s frontend_specs
// and frontend_loki_ci entries — keep both in sync.

import {
  type ModuleDef,
  type ModuleGraph,
  type Rule,
  buildModuleGraph,
  getAffectedModules,
  getChangedModules,
  globToRegex,
  mapFileToModule,
} from "./affected-modules";

export type TestSuiteDef = {
  statsPrefix: string;
  infraPatterns: string[];
  runAllTests?: boolean;
};

type TestSuite = TestSuiteDef & {
  infraRegexes: RegExp[];
};

export type TestPlan = {
  stats: Record<string, number | string[]>;
  unit_tests_to_run: string[];
  loki_stories_to_run: string[];
  e2e_tests_to_run: string[];
};

const SHARED_INFRA = [
  "babel.config.json",
  "tsconfig.json",
  "package.json",
  "bun.lock",
  "rspack.*.js",
  ".github/workflows/run-tests.yml",
];

export const TEST_SUITES: Record<string, TestSuiteDef> = {
  unit: {
    statsPrefix: "unit_tests",
    infraPatterns: [
      ...SHARED_INFRA,
      "jest.config.js",
      "jest.tz.unit.conf.json",
      "frontend/test/**",
      "frontend/**/__mocks__/**",
      ".github/workflows/frontend.yml",
    ],
  },
  loki: {
    statsPrefix: "loki_stories",
    infraPatterns: [
      ...SHARED_INFRA,
      ".loki/**",
      ".storybook/**",
      "loki.config.js",
      ".github/workflows/loki.yml",
    ],
  },
  e2e: {
    statsPrefix: "e2e_tests",
    infraPatterns: [],
    // We don't map changed files to e2e tests yet, so for now just run them all
    runAllTests: true,
  },
};

export function createTestPlan({
  elements,
  rules,
  testSuites: testSuiteDefs,
  changedFiles,
  testFilesBySuite,
}: {
  elements: ModuleDef[];
  rules: Rule[];
  testSuites: Record<string, TestSuiteDef>;
  changedFiles: string[];
  testFilesBySuite: Record<string, string[]>;
}): TestPlan {
  const moduleGraph = buildModuleGraph(elements, rules);
  const testSuites: Record<string, TestSuite> = Object.fromEntries(
    Object.entries(testSuiteDefs).map(([name, testSuite]) => [
      name,
      { ...testSuite, infraRegexes: testSuite.infraPatterns.map(globToRegex) },
    ]),
  );

  const changedModules = getChangedModules(moduleGraph, changedFiles);
  const affectedModules = getAffectedModules(moduleGraph, changedFiles);

  const affectedTests: Record<string, string[]> = {};
  const stats: Record<string, number | string[]> = {
    modules_changed: changedModules.size,
    modules_affected: affectedModules.size,
    affected_modules: [...affectedModules].sort(),
  };

  for (const [name, testSuite] of Object.entries(testSuites)) {
    const files = testFilesBySuite[name] ?? [];
    const tests = createTestPlanForSuite(
      moduleGraph,
      testSuite,
      changedFiles,
      files,
    );
    affectedTests[name] = tests;
    stats[`${testSuite.statsPrefix}_total`] = files.length;
    stats[`${testSuite.statsPrefix}_to_run`] = tests.length;
    stats[`${testSuite.statsPrefix}_to_skip`] = files.length - tests.length;
  }

  return {
    stats,
    unit_tests_to_run: affectedTests.unit ?? [],
    loki_stories_to_run: affectedTests.loki ?? [],
    e2e_tests_to_run: affectedTests.e2e ?? [],
  };
}

/**
 * Computes the test plan for one test suite
 *
 * Runs the full suite when infra files changed or if `runAllTests` flag is set,
 * otherwise runs the tests based on affected-modules.
 */
export function createTestPlanForSuite(
  moduleGraph: ModuleGraph,
  testSuite: TestSuite,
  changedFiles: string[],
  allTestFiles: string[],
): string[] {
  const infraTouched = changedFiles.some((changedFile) =>
    testSuite.infraRegexes.some((infraRegex) => infraRegex.test(changedFile)),
  );
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
