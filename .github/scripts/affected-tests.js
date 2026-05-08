// Per-suite affected-tests logic: combines module-affected closure with
// per-suite "infra-file" patterns that force a full-suite run when changed.
// Mirrors the relevant subset of `.github/file-paths.yaml`'s frontend_specs
// and frontend_loki_ci entries — keep both in sync.

const { createAffectedModules, globToRegex } = require("./affected-modules");

const SHARED_INFRA = [
  "babel.config.json",
  "tsconfig.json",
  "package.json",
  "bun.lock",
  "rspack.*.js",
  ".github/workflows/run-tests.yml",
];

const SUITES = {
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
    // E2E specs don't map to modules; build-e2e-matrix.js handles its own
    // changed-spec selection. Stub run = total here so the schema stays
    // populated until that logic moves into this file.
    statsPrefix: "e2e_tests",
    infraPatterns: [],
    stub: true,
  },
};

function createAffectedTests({ elements, rules, suites }) {
  const modules = createAffectedModules(elements, rules);
  const compiled = Object.fromEntries(
    Object.entries(suites).map(([name, s]) => [
      name,
      { ...s, compiledInfra: s.infraPatterns.map(globToRegex) },
    ]),
  );

  function selectForSuite(suiteName, changedFiles, allTestFiles) {
    const suite = compiled[suiteName];
    if (suite.stub) {
      return {
        run: allTestFiles,
        total: allTestFiles.length,
        trigger: "stub",
      };
    }
    const infraTouched = changedFiles.some((f) =>
      suite.compiledInfra.some((re) => re.test(f)),
    );
    if (infraTouched) {
      return {
        run: allTestFiles,
        total: allTestFiles.length,
        trigger: "infra",
      };
    }
    const affected = modules.affectedModules(changedFiles);
    return {
      run: modules.selectTests(affected, allTestFiles),
      total: allTestFiles.length,
      trigger: "modules",
    };
  }

  function decideAll({ changedFiles, suiteFiles }) {
    const direct = modules.directlyTouchedModules(changedFiles);
    const affected = modules.affectedModules(changedFiles);

    const decisions = {};
    const stats = {
      modules_changed: direct.size,
      modules_affected: affected.size,
      affected_modules: [...affected].sort(),
    };

    for (const [name, suite] of Object.entries(compiled)) {
      const files = suiteFiles[name] ?? [];
      const dec = selectForSuite(name, changedFiles, files);
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

  return { selectForSuite, decideAll };
}

module.exports = { SUITES, createAffectedTests };
