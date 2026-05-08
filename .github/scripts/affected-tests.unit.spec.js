const { createAffectedTests } = require("./affected-tests");

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

const SUITES = {
  unit: {
    statsPrefix: "unit_tests",
    infraPatterns: ["jest.config.js", "src/test/**"],
  },
  loki: {
    statsPrefix: "loki_stories",
    infraPatterns: [".storybook/**"],
  },
  e2e: {
    statsPrefix: "e2e_tests",
    infraPatterns: [],
    stub: true,
  },
};

const UNIT_FILES = [
  "src/foo/foo.unit.spec.ts",
  "src/foo/bar.unit.spec.ts",
  "src/bar/bar.unit.spec.ts",
  "src/utils/utils.unit.spec.ts",
];
const LOKI_FILES = ["src/foo/Foo.stories.tsx", "src/bar/Bar.stories.tsx"];
const E2E_FILES = ["e2e/test/scenarios/a.cy.spec.ts"];

const { selectForSuite, decideAll } = createAffectedTests({
  elements: ELEMENTS,
  rules: RULES,
  suites: SUITES,
});

describe("selectForSuite", () => {
  it("should run all tests when an infra pattern matches", () => {
    const result = selectForSuite("unit", ["jest.config.js"], UNIT_FILES);
    expect(result.trigger).toBe("infra");
    expect(result.run).toEqual(UNIT_FILES);
    expect(result.total).toBe(UNIT_FILES.length);
  });

  it("should run all tests when a deeper infra pattern matches via **", () => {
    const result = selectForSuite(
      "unit",
      ["src/test/setup-env.ts"],
      UNIT_FILES,
    );
    expect(result.trigger).toBe("infra");
    expect(result.run.length).toBe(UNIT_FILES.length);
  });

  it("should fall back to module-affected selection when no infra matches", () => {
    const result = selectForSuite("unit", ["src/foo/x.ts"], UNIT_FILES);
    expect(result.trigger).toBe("modules");
    expect(result.run.sort()).toEqual([
      "src/foo/bar.unit.spec.ts",
      "src/foo/foo.unit.spec.ts",
    ]);
  });

  it("should return nothing when no infra matches and no file maps to a module", () => {
    const result = selectForSuite("unit", ["docs/foo.md"], UNIT_FILES);
    expect(result.trigger).toBe("modules");
    expect(result.run).toEqual([]);
  });

  it("should use each suite's own infra patterns", () => {
    const lokiInfra = selectForSuite(
      "loki",
      [".storybook/main.ts"],
      LOKI_FILES,
    );
    expect(lokiInfra.trigger).toBe("infra");
    expect(lokiInfra.run.length).toBe(LOKI_FILES.length);

    const lokiOther = selectForSuite("loki", ["jest.config.js"], LOKI_FILES);
    expect(lokiOther.trigger).toBe("modules");
    expect(lokiOther.run).toEqual([]);
  });

  it("should run all tests for stub suites regardless of diff", () => {
    expect(selectForSuite("e2e", ["docs/foo.md"], E2E_FILES).run).toEqual(
      E2E_FILES,
    );
    expect(selectForSuite("e2e", ["src/foo/x.ts"], E2E_FILES).run).toEqual(
      E2E_FILES,
    );
  });
});

describe("decideAll", () => {
  it("should return run lists and stats together", () => {
    const result = decideAll({
      changedFiles: ["src/foo/x.ts"],
      suiteFiles: {
        unit: UNIT_FILES,
        loki: LOKI_FILES,
        e2e: E2E_FILES,
      },
    });

    expect(result.unit_tests_to_run.sort()).toEqual([
      "src/foo/bar.unit.spec.ts",
      "src/foo/foo.unit.spec.ts",
    ]);
    expect(result.loki_stories_to_run).toEqual(["src/foo/Foo.stories.tsx"]);
    expect(result.e2e_tests_to_run).toEqual(E2E_FILES);

    expect(result.stats).toEqual({
      modules_changed: 1,
      modules_affected: 1,
      affected_modules: ["feature/foo"],
      unit_tests_total: 4,
      unit_tests_to_run: 2,
      unit_tests_to_skip: 2,
      loki_stories_total: 2,
      loki_stories_to_run: 1,
      loki_stories_to_skip: 1,
      e2e_tests_total: 1,
      e2e_tests_to_run: 1,
      e2e_tests_to_skip: 0,
    });
  });

  it("should run all tests for the suite when its infra files change", () => {
    const result = decideAll({
      changedFiles: ["jest.config.js"],
      suiteFiles: { unit: UNIT_FILES, loki: LOKI_FILES, e2e: E2E_FILES },
    });
    expect(result.stats.unit_tests_to_run).toBe(UNIT_FILES.length);
    expect(result.stats.unit_tests_to_skip).toBe(0);
    // Loki has its own infra patterns; jest.config.js doesn't match.
    expect(result.stats.loki_stories_to_run).toBe(0);
  });

  it("should not run anything when changes don't touch any module or infra", () => {
    const result = decideAll({
      changedFiles: ["docs/foo.md"],
      suiteFiles: { unit: UNIT_FILES, loki: LOKI_FILES, e2e: E2E_FILES },
    });
    expect(result.stats.unit_tests_to_run).toBe(0);
    expect(result.stats.loki_stories_to_run).toBe(0);
    // Stub: e2e still reports run = total.
    expect(result.stats.e2e_tests_to_run).toBe(E2E_FILES.length);
  });
});
