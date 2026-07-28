const {
  entrypointJsAssets,
  selectAppAssets,
  selectLegacySdkAssets,
  selectChunkedSdkAssets,
} = require("./measure-bundle-sizes");

const RUNTIME = "embedding-sdk-chunk-runtime.deadbeef.js";

const stats = entrypoints => ({ entrypoints });

describe("entrypointJsAssets", () => {
  it("returns the .js asset names for a field, accepting strings or {name}", () => {
    const s = stats({ app: { assets: [{ name: "a.js" }, "b.js", { name: "c.css" }] } });
    expect(entrypointJsAssets(s, "app", "assets")).toEqual(["a.js", "b.js"]);
  });

  it("returns null when the entrypoint or field is absent", () => {
    expect(entrypointJsAssets(stats({}), "missing")).toBeNull();
    expect(entrypointJsAssets(null, "app")).toBeNull();
  });
});

describe("selectAppAssets", () => {
  it("returns the initial set and a null reachable set on pre-enrichment stats", () => {
    const s = stats({ "app-main": { assets: ["main.js"] } });
    expect(selectAppAssets(s)).toEqual({ initialAssets: ["main.js"], reachableAssets: null });
  });

  it("throws when the app-main entrypoint is missing", () => {
    expect(() => selectAppAssets(stats({}))).toThrow("app-main");
  });
});

describe("selectChunkedSdkAssets", () => {
  const base = {
    "embedding-sdk-chunked": { assets: ["a.js", RUNTIME], reachableAssets: ["a.js", "b.js", RUNTIME] },
    "embedding-sdk-bootstrap": { assets: ["boot.js"], reachableAssets: ["boot.js"] },
  };

  it("merges bootstrap + chunked, drops the inlined runtime, and counts async chunks", () => {
    const result = selectChunkedSdkAssets(stats(base), { sdkAsyncChunksLoadable: true });
    expect(result.initialNames).toEqual(["boot.js", "a.js"]);
    expect(result.reachableNames).toEqual(["boot.js", "a.js", "b.js"]);
    expect(result.includesAsyncChunks).toBe(true);
  });

  it("collapses total to initial when async chunks are not loadable", () => {
    const result = selectChunkedSdkAssets(stats(base), { sdkAsyncChunksLoadable: false });
    expect(result.includesAsyncChunks).toBe(false);
  });

  it("collapses total to initial when the stats carry no reachable graph", () => {
    const noGraph = { "embedding-sdk-chunked": { assets: ["a.js"] } };
    const result = selectChunkedSdkAssets(stats(noGraph), { sdkAsyncChunksLoadable: true });
    expect(result.reachableNames).toEqual(["a.js"]);
    expect(result.includesAsyncChunks).toBe(false);
  });

  it("throws when the chunked entrypoint is missing", () => {
    expect(() => selectChunkedSdkAssets(stats({}), { sdkAsyncChunksLoadable: true })).toThrow(
      "embedding-sdk-chunked",
    );
  });
});

describe("selectLegacySdkAssets", () => {
  it("returns null when the legacy entry is absent so the caller can fall back", () => {
    expect(selectLegacySdkAssets(stats({}), { sdkAsyncChunksLoadable: true })).toBeNull();
  });

  it("expands total to the reachable async set when loadable", () => {
    const s = stats({ "embedding-sdk": { assets: ["legacy.js"], reachableAssets: ["legacy.js", "chunk.js"] } });
    expect(selectLegacySdkAssets(s, { sdkAsyncChunksLoadable: true })).toEqual({
      initialNames: ["legacy.js"],
      reachableNames: ["legacy.js", "chunk.js"],
    });
  });

  it("collapses total to initial when async chunks are not loadable", () => {
    const s = stats({ "embedding-sdk": { assets: ["legacy.js"], reachableAssets: ["legacy.js", "chunk.js"] } });
    expect(selectLegacySdkAssets(s, { sdkAsyncChunksLoadable: false })).toEqual({
      initialNames: ["legacy.js"],
      reachableNames: ["legacy.js"],
    });
  });
});
