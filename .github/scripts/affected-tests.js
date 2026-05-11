// Per-suite affected-tests logic: combines module-affected closure with
// per-suite "infra-file" patterns that force a full-suite run when changed.
// Mirrors the relevant subset of `.github/file-paths.yaml`'s frontend_specs
// and frontend_loki_ci entries — keep both in sync.

const {
  affectedModules,
  buildModuleGraph,
  directlyTouchedModules,
  globToRegex,
  selectTests,
} = require("./affected-modules");

const SHARED_INFRA = [
  "babel.config.json",
  "tsconfig.json",
  "package.json",
  "bun.lock",
  "rspack.*.js",
  ".github/workflows/run-tests.yml",
];

const TEST_SUITES = {
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

/**
 * Precomputes a graph + compiled-suites bundle for a given config.
 */
function computeAffectedTests({ elements, rules, suites }) {
  return {
    graph: buildModuleGraph(elements, rules),
    suites: Object.fromEntries(
      Object.entries(suites).map(([name, s]) => [
        name,
        { ...s, compiledInfra: s.infraPatterns.map(globToRegex) },
      ]),
    ),
  };
}

/**
 * Computes the test plan for one test suite
 *
 * Runs the full suite when the suite is marked `runAllTests`
 * or when any changed file matches its infra patterns; otherwise picks the
 * tests inside the affected-modules closure.
 */
function createTestPlanForSuite(
  config,
  suiteName,
  changedFiles,
  allTestFiles,
) {
  const suite = config.suites[suiteName];
  const infraTouched = changedFiles.some((f) =>
    suite.compiledInfra.some((re) => re.test(f)),
  );
  if (suite.runAllTests || infraTouched) {
    return { run: allTestFiles, total: allTestFiles.length };
  }
  const affected = affectedModules(config.graph, changedFiles);
  return {
    run: selectTests(config.graph, affected, allTestFiles),
    total: allTestFiles.length,
  };
}

/**
 * Computes the full test plan: per-suite run lists plus the stats row
 * uploaded by upload-affected-tests-stats.js.
 */
function createTestPlan(config, { changedFiles, suiteFiles }) {
  const direct = directlyTouchedModules(config.graph, changedFiles);
  const affected = affectedModules(config.graph, changedFiles);

  const decisions = {};
  const stats = {
    modules_changed: direct.size,
    modules_affected: affected.size,
    affected_modules: [...affected].sort(),
  };

  for (const [name, suite] of Object.entries(config.suites)) {
    const files = suiteFiles[name] ?? [];
    const dec = createTestPlanForSuite(config, name, changedFiles, files);
    decisions[name] = dec;
    stats[`${suite.statsPrefix}_total`] = dec.total;
    stats[`${suite.statsPrefix}_to_run`] = dec.run.length;
    stats[`${suite.statsPrefix}_to_skip`] = dec.total - dec.run.length;
  }

  return {
    stats,
    unit_tests_to_run: decisions.unit?.run ?? [],
    loki_stories_to_run: decisions.loki?.run ?? [],
    e2e_tests_to_run: decisions.e2e?.run ?? [],
  };
}

module.exports = {
  TEST_SUITES,
  computeAffectedTests,
  createTestPlanForSuite,
  createTestPlan,
};
