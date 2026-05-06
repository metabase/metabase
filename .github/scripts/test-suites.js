const { createAffectedTests, globToRegex } = require("./affected-tests");

// Per-suite "infra-file" patterns: when ANY of these match a changed file,
// the whole suite runs (overrides module-affected selection). Outside that,
// per-suite selection falls back to the module-affected closure.
//
// These patterns mirror the relevant subset of `.github/file-paths.yaml`'s
// frontend_specs / frontend_loki_ci entries. Until file-paths.yaml's test
// gates are retired, keep both lists in sync — touching one means touching
// the other.
const SUITES = {
  unit: {
    statsPrefix: "unit_tests",
    infraPatterns: [
      "jest.config.js",
      "jest.tz.unit.conf.json",
      "frontend/test/**",
      "frontend/**/__mocks__/**",
      "babel.config.json",
      "tsconfig.json",
      "package.json",
      "bun.lock",
      "rspack.*.js",
      ".github/workflows/frontend.yml",
      ".github/workflows/run-tests.yml",
    ],
  },
  loki: {
    statsPrefix: "loki_stories",
    infraPatterns: [
      ".loki/**",
      ".storybook/**",
      "loki.config.js",
      "babel.config.json",
      "tsconfig.json",
      "package.json",
      "bun.lock",
      "rspack.*.js",
      ".github/workflows/loki.yml",
      ".github/workflows/run-tests.yml",
    ],
  },
  e2e: {
    // Stage-1 stub. E2E specs don't map to modules and the existing
    // build-e2e-matrix.js logic isn't ported here yet; emit run = total
    // so the schema slot is filled until selection is wired up.
    statsPrefix: "e2e_tests",
    infraPatterns: [],
    stub: true,
  },
};

function compilePatterns(patterns) {
  return patterns.map((p) => globToRegex(p));
}

function createTestSelection({ elements, rules, suites }) {
  const af = createAffectedTests(elements, rules);
  const compiled = Object.fromEntries(
    Object.entries(suites).map(([name, s]) => [
      name,
      { ...s, compiledInfra: compilePatterns(s.infraPatterns) },
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
    const affected = af.affectedModules(changedFiles);
    return {
      run: af.selectTests(affected, allTestFiles),
      total: allTestFiles.length,
      trigger: "modules",
    };
  }

  function decideAll({ changedFiles, suiteFiles }) {
    const direct = af.directlyTouchedModules(changedFiles);
    const affected = af.affectedModules(changedFiles);

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

module.exports = { SUITES, createTestSelection };
