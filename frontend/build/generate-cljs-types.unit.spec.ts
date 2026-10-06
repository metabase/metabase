import {
  extractExportNames,
  parseEntryModuleNames,
  renderDeclarations,
} from "./generate-cljs-types";

const HEADER =
  "// Generated from the cljs build by `bun run generate:cljs-types`. Commit what it changes.";

describe("parseEntryModuleNames", () => {
  it("should return the entry namespaces with dashes replaced by underscores", () => {
    const shadowConfig = `
{:builds
 {:app
  {:target  :npm-module
   :entries [metabase.lib.js
             metabase.lib.column-group
             metabase.xrays.domain-entities.queries.util]}}}
`;

    expect(parseEntryModuleNames(shadowConfig)).toEqual([
      "metabase.lib.js",
      "metabase.lib.column_group",
      "metabase.xrays.domain_entities.queries.util",
    ]);
  });

  it("should skip entries commented out with ;;", () => {
    const shadowConfig = `
{:builds
 {:app
  {:entries [metabase.lib.js
             ;; metabase.lib.limit [not built]
             metabase.pivot.js]}}}
`;

    expect(parseEntryModuleNames(shadowConfig)).toEqual([
      "metabase.lib.js",
      "metabase.pivot.js",
    ]);
  });
});

describe("extractExportNames", () => {
  it("should return the sorted export names of a compiled namespace", () => {
    const compiledSource = [
      'var $CLJS = require("./cljs_env");',
      'require("./cljs.core.js");',
      'Object.defineProperty(module.exports, "limit", { enumerable: true, get: function() { return metabase.lib.limit.limit; } });',
      'Object.defineProperty(module.exports, "current_limit", { enumerable: true, get: function() { return metabase.lib.limit.current_limit; } });',
      "//# sourceMappingURL=metabase.lib.limit.js.map",
    ].join("\n");

    expect(extractExportNames(compiledSource)).toEqual([
      "current_limit",
      "limit",
    ]);
  });

  it("should return no names for a namespace without exports", () => {
    const compiledSource = [
      'var $CLJS = require("./cljs_env");',
      "//# sourceMappingURL=metabase.pivot.core.js.map",
    ].join("\n");

    expect(extractExportNames(compiledSource)).toEqual([]);
  });
});

describe("renderDeclarations", () => {
  it("should declare each export as any", () => {
    expect(renderDeclarations(["current_limit", "limit"])).toBe(
      [
        HEADER,
        "export const current_limit: any;",
        "export const limit: any;",
        "",
      ].join("\n"),
    );
  });

  it("should render an empty module for a namespace without exports", () => {
    expect(renderDeclarations([])).toBe([HEADER, "export {};", ""].join("\n"));
  });
});
