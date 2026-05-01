const { createAffectedTests } = require("./affected-tests");

// Fixture isolated from the real module-boundaries config so reshuffles there
// don't cascade into these tests.
const ELEMENTS = [
  { type: "lib/utils", pattern: "src/utils/**" },
  { type: "lib/types", pattern: "src/types/**" },
  { type: "feature/foo", pattern: "src/foo/**" },
  { type: "feature/bar", pattern: "src/bar/**" },
  { type: "feature/super", pattern: "src/super/**" },
  { type: "app/main", pattern: "src/app.js" },
  { type: "shared/other", pattern: "src/*/**" }, // catch-all, must be last
];

const RULES = [
  ...ELEMENTS.map((el) => ({ from: [el.type], allow: [el.type] })),
  { from: ["lib/*"], allow: ["lib/*"] },
  { from: ["feature/*"], allow: ["lib/*"] },
  { from: ["feature/super"], allow: ["feature/*"] },
  { from: ["app/*"], allow: ["lib/*", "feature/*", "app/*"] },
];

const {
  affectedModules,
  computeStats,
  directlyTouchedModules,
  fileToModule,
  selectTests,
} = createAffectedTests(ELEMENTS, RULES);

describe("fileToModule", () => {
  it.each([
    ["src/utils/colors.ts", "lib/utils"],
    ["src/types/api.ts", "lib/types"],
    ["src/foo/foo.tsx", "feature/foo"],
    ["src/bar/bar.tsx", "feature/bar"],
    ["src/super/index.ts", "feature/super"],
    ["src/app.js", "app/main"],
    ["src/randomthing/file.ts", "shared/other"], // matches catch-all
  ])("maps %s → %s", (path, expected) => {
    expect(fileToModule(path)).toBe(expected);
  });

  it("returns null for files outside any pattern", () => {
    expect(fileToModule("docs/foo.md")).toBe(null);
    expect(fileToModule("README.md")).toBe(null);
  });
});

describe("directlyTouchedModules", () => {
  it("returns the unique set of modules whose files changed", () => {
    const result = directlyTouchedModules([
      "src/utils/colors.ts",
      "src/foo/x.ts",
      "src/foo/y.ts",
      "docs/unrelated.md",
    ]);
    expect([...result].sort()).toEqual(["feature/foo", "lib/utils"]);
  });

  it("returns an empty set when no file maps to a module", () => {
    expect(directlyTouchedModules(["docs/foo.md"]).size).toBe(0);
  });
});

describe("affectedModules", () => {
  it("includes feature/super and app/main but not feature/bar when feature/foo changes", () => {
    const result = affectedModules(["src/foo/x.ts"]);
    expect([...result].sort()).toEqual([
      "app/main",
      "feature/foo",
      "feature/super",
    ]);
  });

  it("ripples broadly when a lib module changes", () => {
    const result = affectedModules(["src/utils/colors.ts"]);
    expect(result.has("lib/utils")).toBe(true);
    expect(result.has("feature/foo")).toBe(true);
    expect(result.has("feature/bar")).toBe(true);
    expect(result.has("feature/super")).toBe(true);
    expect(result.has("app/main")).toBe(true);
  });

  it("returns empty when no file maps to a module", () => {
    expect(affectedModules(["docs/foo.md"]).size).toBe(0);
  });
});

describe("selectTests", () => {
  it("keeps only tests inside affected modules", () => {
    const affected = new Set(["feature/foo", "lib/utils"]);
    const tests = [
      "src/foo/foo.unit.spec.ts",
      "src/utils/colors.unit.spec.ts",
      "src/bar/bar.unit.spec.ts",
      "docs/unrelated.unit.spec.ts",
    ];
    expect(selectTests(affected, tests)).toEqual([
      "src/foo/foo.unit.spec.ts",
      "src/utils/colors.unit.spec.ts",
    ]);
  });
});

describe("computeStats", () => {
  it("aggregates module + test counts", () => {
    const stats = computeStats({
      changedFiles: ["src/foo/x.ts"],
      unitTestFiles: [
        "src/foo/a.unit.spec.ts",
        "src/foo/b.unit.spec.ts",
        "src/bar/c.unit.spec.ts",
        "src/utils/d.unit.spec.ts",
      ],
      storyFiles: ["src/foo/Foo.stories.tsx", "src/bar/Bar.stories.tsx"],
    });
    expect(stats).toEqual({
      modules_directly_touched: 1,
      modules_affected: 3,
      affected_modules: ["app/main", "feature/foo", "feature/super"],
      unit_tests_total: 4,
      unit_tests_to_run: 2,
      unit_tests_to_skip: 2,
      loki_stories_total: 2,
      loki_stories_to_run: 1,
      loki_stories_to_skip: 1,
    });
  });
});
