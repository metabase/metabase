import {
  getEnforcedModules,
  getNamedModules,
  getUnmoduledFolders,
} from "../module-boundaries-stats.mjs";

function element({ type, pattern = "frontend/src/metabase/x/**", ...rest }) {
  return { type, pattern, ...rest };
}

describe("getNamedModules", () => {
  it("counts a module with multiple pattern entries once", () => {
    const elements = [
      element({ type: "app/mcp-app" }),
      element({ type: "app/mcp-app" }),
      element({ type: "app/mcp-app" }),
      element({ type: "shared/nav" }),
    ];
    expect(getNamedModules(elements)).toEqual(
      new Set(["app/mcp-app", "shared/nav"]),
    );
  });

  it("excludes the catch-all buckets", () => {
    const elements = [
      element({ type: "shared/other" }),
      element({ type: "app/misc" }),
      element({ type: "other" }),
      element({ type: "shared/nav" }),
    ];
    expect(getNamedModules(elements)).toEqual(new Set(["shared/nav"]));
  });
});

describe("getEnforcedModules", () => {
  it("only counts modules with enforceOutgoing", () => {
    const elements = [
      element({ type: "shared/nav", enforceOutgoing: true }),
      element({ type: "shared/home" }),
    ];
    expect(getEnforcedModules(elements)).toEqual(new Set(["shared/nav"]));
  });

  it("counts a module with multiple enforced entries once", () => {
    const elements = [
      element({ type: "app/mcp-app", enforceOutgoing: true }),
      element({ type: "app/mcp-app", enforceOutgoing: true }),
    ];
    expect(getEnforcedModules(elements)).toEqual(new Set(["app/mcp-app"]));
  });

  it("excludes the catch-all buckets even when enforced", () => {
    const elements = [
      element({ type: "app/misc", enforceOutgoing: true }),
      element({ type: "shared/other", enforceOutgoing: true }),
      element({ type: "shared/nav", enforceOutgoing: true }),
    ];
    expect(getEnforcedModules(elements)).toEqual(new Set(["shared/nav"]));
  });

  it("is a subset of the named modules", () => {
    const elements = [
      element({ type: "shared/nav", enforceOutgoing: true }),
      element({ type: "shared/home" }),
      element({ type: "app/misc", enforceOutgoing: true }),
    ];
    const named = getNamedModules(elements);
    for (const type of getEnforcedModules(elements)) {
      expect(named).toContain(type);
    }
  });
});

describe("getUnmoduledFolders", () => {
  const folders = ["nav", "home", "hoc", "rich_text_editing"];

  it("returns folders no pattern points into", () => {
    const elements = [
      element({ type: "shared/nav", pattern: "frontend/src/metabase/nav/**" }),
      element({
        type: "shared/home",
        pattern: "frontend/src/metabase/home/**",
      }),
    ];
    expect(getUnmoduledFolders(elements, folders)).toEqual([
      "hoc",
      "rich_text_editing",
    ]);
  });

  it("ignores patterns outside frontend/src/metabase", () => {
    const elements = [
      element({
        type: "shared/embedding-sdk",
        pattern: "enterprise/frontend/src/embedding-sdk-ee/**",
      }),
      element({ type: "shared/nav", pattern: "frontend/src/nav/**" }),
    ];
    expect(getUnmoduledFolders(elements, folders)).toEqual(folders);
  });

  it("matches a folder from a pattern into a subdirectory", () => {
    const elements = [
      element({
        type: "app/nav-part",
        pattern: "frontend/src/metabase/nav/components/**",
      }),
    ];
    expect(getUnmoduledFolders(elements, folders)).toEqual([
      "home",
      "hoc",
      "rich_text_editing",
    ]);
  });

  it("returns every folder when there are no elements", () => {
    expect(getUnmoduledFolders([], folders)).toEqual(folders);
  });
});
