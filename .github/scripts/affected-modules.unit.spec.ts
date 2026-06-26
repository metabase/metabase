import {
  buildFileGraph,
  buildModuleGraph,
  buildNodes,
  getAffectedFiles,
  getAffectedModules,
  getAffectedModulesFromFiles,
  getChangedModules,
  mapFileToModule,
  parseCruiseModules,
} from "./affected-modules";

const ELEMENTS = [
  { type: "lib/utils", pattern: "src/utils/**" },
  { type: "lib/types", pattern: "src/types/**" },
  // Nested-pattern pair (mirrors mlv1-inside-mlv2): inner must come first
  // so first-match-wins picks it up before the outer pattern.
  { type: "lib/inner", pattern: "src/shared/v1/**" },
  { type: "lib/outer", pattern: "src/shared/**" },
  { type: "feature/foo", pattern: "src/foo/**" },
  { type: "feature/bar", pattern: "src/bar/**" },
  { type: "feature/super", pattern: "src/super/**" },
  // Different folder root (mirrors feature/enterprise's enterprise/ path).
  { type: "feature/external", pattern: "external/lib/**" },
  // Same type, two patterns (mirrors app/misc per-entry-point declarations).
  { type: "app/main", pattern: "src/app.js" },
  { type: "app/main", pattern: "src/embed.tsx" },
  { type: "shared/other", pattern: "src/*/**" }, // catch-all, must be last
];

const RULES = [
  ...ELEMENTS.map((el) => ({ from: [el.type], allow: [el.type] })),
  { from: ["lib/*"], allow: ["lib/*"] },
  { from: ["feature/*"], allow: ["lib/*"] },
  { from: ["feature/super"], allow: ["feature/*"] },
  { from: ["app/*"], allow: ["lib/*", "feature/*", "app/*"] },
];

const nodes = buildNodes(ELEMENTS);
const graph = buildModuleGraph(ELEMENTS, RULES);

describe("affected modules", () => {
  describe("mapFileToModule", () => {
    it.each([
      ["src/utils/colors.ts", "lib/utils"],
      ["src/types/api.ts", "lib/types"],
      ["src/foo/foo.tsx", "feature/foo"],
      ["src/bar/bar.tsx", "feature/bar"],
      ["src/super/index.ts", "feature/super"],
      ["src/app.js", "app/main"],
      ["src/randomthing/file.ts", "shared/other"],
      ["src/shared/v1/expr.ts", "lib/inner"],
      ["src/shared/v2/expr.ts", "lib/outer"],
      ["src/shared/index.ts", "lib/outer"],
      ["external/lib/foo.ts", "feature/external"],
      ["src/embed.tsx", "app/main"],
    ])("should map %s to %s", (path, expected) => {
      expect(mapFileToModule(nodes, path)).toBe(expected);
    });

    it("should return null for files outside any pattern", () => {
      expect(mapFileToModule(nodes, "docs/foo.md")).toBe(null);
      expect(mapFileToModule(nodes, "README.md")).toBe(null);
      expect(mapFileToModule(nodes, "external/notlib/foo.ts")).toBe(null);
    });
  });

  describe("getChangedModules", () => {
    it("should return the unique set of modules whose files changed", () => {
      const result = getChangedModules(nodes, [
        "src/utils/colors.ts",
        "src/foo/x.ts",
        "src/foo/y.ts",
        "docs/unrelated.md",
      ]);
      expect([...result].sort()).toEqual(["feature/foo", "lib/utils"]);
    });

    it("should return an empty set when no file maps to a module", () => {
      expect(getChangedModules(nodes, ["docs/foo.md"]).size).toBe(0);
    });
  });

  describe("parseCruiseModules", () => {
    it("should flatten to source + resolved-paths and drop unresolved deps", () => {
      expect(
        parseCruiseModules([
          {
            source: "src/foo/foo.tsx",
            dependencies: [
              { resolved: "src/utils/colors.ts" },
              { resolved: "ambient/types", couldNotResolve: true },
            ],
          },
          { source: "src/bar/bar.tsx" }, // no dependencies key
        ]),
      ).toEqual([
        { source: "src/foo/foo.tsx", dependencies: ["src/utils/colors.ts"] },
        { source: "src/bar/bar.tsx", dependencies: [] },
      ]);
    });
  });

  // Hub-merging scenario: app/main contains BOTH an entry point (app.js) that
  // imports feature/foo AND a widely-imported file (embed.tsx) that feature/bar
  // imports. A module-level graph would manufacture feature/foo -> app/main ->
  // feature/bar; walking files first does not, because nothing imports app.js.
  const FILE_DEPS = [
    { source: "src/app.js", dependencies: ["src/foo/foo.tsx"] },
    { source: "src/bar/bar.tsx", dependencies: ["src/embed.tsx"] },
    { source: "src/foo/foo.tsx", dependencies: ["src/utils/colors.ts"] },
  ];
  const fileGraph = buildFileGraph(ELEMENTS, FILE_DEPS);

  describe("getAffectedFiles", () => {
    it("should return the changed file and everything that imports it", () => {
      expect(
        [...getAffectedFiles(fileGraph, ["src/utils/colors.ts"])].sort(),
      ).toEqual(["src/app.js", "src/foo/foo.tsx", "src/utils/colors.ts"]);
    });

    it("should include a changed file with no importers (itself only)", () => {
      // Nothing imports the app.js entry point.
      expect([...getAffectedFiles(fileGraph, ["src/app.js"])]).toEqual([
        "src/app.js",
      ]);
    });
  });

  describe("getAffectedModulesFromFiles", () => {
    it("should expand affected files to their owning modules", () => {
      expect(
        [
          ...getAffectedModulesFromFiles(fileGraph, ["src/utils/colors.ts"]),
        ].sort(),
      ).toEqual(["app/main", "feature/foo", "lib/utils"]);
    });

    it("should NOT pull in feature/bar via the app/main hub", () => {
      // The bug a module-level graph has: feature/bar imports embed.tsx (app/main)
      // and app.js (app/main) imports feature/foo, but those are different files.
      const affected = getAffectedModulesFromFiles(fileGraph, [
        "src/foo/foo.tsx",
      ]);
      expect([...affected].sort()).toEqual(["app/main", "feature/foo"]);
      expect(affected.has("feature/bar")).toBe(false);
    });

    it("should return empty when no file maps to a module", () => {
      expect(getAffectedModulesFromFiles(fileGraph, ["docs/foo.md"]).size).toBe(
        0,
      );
    });
  });

  describe("getAffectedModules (rules-graph fallback)", () => {
    it("should affect feature/super and app/main but not feature/bar when feature/foo changes", () => {
      const result = getAffectedModules(graph, ["src/foo/x.ts"]);
      expect([...result].sort()).toEqual([
        "app/main",
        "feature/foo",
        "feature/super",
      ]);
    });

    it("should affect many modules when a lib module changes", () => {
      const result = getAffectedModules(graph, ["src/utils/colors.ts"]);
      expect(result.has("lib/utils")).toBe(true);
      expect(result.has("feature/foo")).toBe(true);
      expect(result.has("feature/bar")).toBe(true);
      expect(result.has("feature/super")).toBe(true);
      expect(result.has("app/main")).toBe(true);
    });

    it("should return empty when no file maps to a module", () => {
      expect(getAffectedModules(graph, ["docs/foo.md"]).size).toBe(0);
    });
  });
});
