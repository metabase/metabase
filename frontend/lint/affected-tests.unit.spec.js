const {
  affectedModules,
  computeStats,
  directlyTouchedModules,
  fileToModule,
  selectTests,
} = require("./affected-tests");

describe("fileToModule", () => {
  it.each([
    ["frontend/src/metabase/dashboard/components/Foo.tsx", "feature/dashboard"],
    ["frontend/src/metabase/utils/colors.ts", "lib/utils"],
    ["frontend/src/metabase/ui/Button.tsx", "basic/ui"],
    ["frontend/src/metabase-types/api/dashboard.ts", "lib/types"],
    ["frontend/src/metabase/schema.js", "lib/schema"],
    ["frontend/src/metabase/env.ts", "lib/env"],
    ["frontend/src/metabase-lib/v1/foo.ts", "basic/mlv1"],
    ["frontend/src/metabase-lib/v2/expressions.ts", "lib/mlv2"],
    ["frontend/src/metabase/admin/components/Foo.tsx", "feature/admin"],
    [
      "enterprise/frontend/src/metabase-enterprise/foo.ts",
      "feature/enterprise",
    ],
    ["frontend/src/metabase/something-random/file.ts", "shared/other"],
  ])("maps %s → %s", (path, expected) => {
    expect(fileToModule(path)).toBe(expected);
  });

  it("returns null for files outside the module patterns", () => {
    expect(fileToModule("docs/foo.md")).toBe(null);
    expect(fileToModule("README.md")).toBe(null);
  });
});

describe("directlyTouchedModules", () => {
  it("returns the set of modules whose files changed", () => {
    const result = directlyTouchedModules([
      "frontend/src/metabase/utils/colors.ts",
      "frontend/src/metabase/dashboard/x.ts",
      "frontend/src/metabase/dashboard/y.ts",
      "docs/unrelated.md",
    ]);
    expect([...result].sort()).toEqual(["feature/dashboard", "lib/utils"]);
  });

  it("returns an empty set when no file maps to a module", () => {
    expect(directlyTouchedModules(["docs/foo.md"]).size).toBe(0);
  });
});

describe("affectedModules", () => {
  it("includes downstream modules per the idealized graph", () => {
    // Touching a feature only ripples to enterprise (which can import any
    // feature) and the app modules — not other unrelated features.
    const result = affectedModules(["frontend/src/metabase/dashboard/x.ts"]);
    expect([...result].sort()).toEqual([
      "app/misc",
      "feature/dashboard",
      "feature/enterprise",
    ]);
  });

  it("ripples broadly when a lib module changes", () => {
    const result = affectedModules(["frontend/src/metabase/utils/colors.ts"]);
    expect(result.has("lib/utils")).toBe(true);
    expect(result.has("basic/ui")).toBe(true);
    expect(result.has("shared/common")).toBe(true);
    expect(result.has("feature/dashboard")).toBe(true);
    expect(result.has("app/misc")).toBe(true);
  });

  it("returns empty when no file maps to a module", () => {
    expect(affectedModules(["docs/foo.md"]).size).toBe(0);
  });
});

describe("selectTests", () => {
  it("keeps only tests inside affected modules", () => {
    const affected = new Set(["feature/dashboard", "lib/utils"]);
    const tests = [
      "frontend/src/metabase/dashboard/dashboard.unit.spec.ts",
      "frontend/src/metabase/utils/colors.unit.spec.ts",
      "frontend/src/metabase/admin/admin.unit.spec.ts",
      "docs/unrelated.unit.spec.ts",
    ];
    expect(selectTests(affected, tests)).toEqual([
      "frontend/src/metabase/dashboard/dashboard.unit.spec.ts",
      "frontend/src/metabase/utils/colors.unit.spec.ts",
    ]);
  });
});

describe("computeStats", () => {
  it("aggregates module + test counts", () => {
    const stats = computeStats({
      changedFiles: ["frontend/src/metabase/dashboard/x.ts"],
      unitTestFiles: [
        "frontend/src/metabase/dashboard/a.unit.spec.ts",
        "frontend/src/metabase/dashboard/b.unit.spec.ts",
        "frontend/src/metabase/admin/c.unit.spec.ts",
        "frontend/src/metabase/utils/d.unit.spec.ts",
      ],
      storyFiles: [
        "frontend/src/metabase/dashboard/Foo.stories.tsx",
        "frontend/src/metabase/admin/Bar.stories.tsx",
      ],
    });
    expect(stats).toEqual({
      modules_directly_touched: 1,
      modules_affected: 3, // dashboard + enterprise + app/misc
      affected_modules: ["app/misc", "feature/dashboard", "feature/enterprise"],
      unit_tests_total: 4,
      unit_tests_to_run: 2,
      unit_tests_to_skip: 2,
      loki_stories_total: 2,
      loki_stories_to_run: 1,
      loki_stories_to_skip: 1,
    });
  });
});
