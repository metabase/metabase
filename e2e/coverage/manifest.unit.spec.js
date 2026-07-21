import {
  baselinePerTestDeltas,
  discriminatingFiles,
  discriminatingFilesForTest,
  fileExceedsBaseline,
} from "./baseline.mjs";
import {
  buildRouteTable,
  matchRoute,
  normalizeRoute,
  normalizeRoutes,
} from "./routes.mjs";

const REPO_ROOT = "/repo";

describe("normalizeRoute", () => {
  it("replaces numeric segments with :id", () => {
    expect(normalizeRoute("GET /api/card/173/query")).toBe(
      "GET /api/card/:id/query",
    );
  });

  it("replaces UUID segments with :uuid", () => {
    expect(
      normalizeRoute(
        "GET /api/public/dashboard/f0e545b0-5f2e-45a7-91b6-371041fdcd48",
      ),
    ).toBe("GET /api/public/dashboard/:uuid");
  });

  it("replaces NanoID entity-id segments with :entity-id", () => {
    expect(normalizeRoute("GET /api/card/vXpKSQIDGNfeAmS1VYzN9")).toBe(
      "GET /api/card/:entity-id",
    );
  });

  it("keeps 21-char lowercase literal segments", () => {
    expect(normalizeRoute("GET /api/notification_channels")).toBe(
      "GET /api/notification_channels",
    );
  });

  it("keeps literal segments and passes through malformed values", () => {
    expect(normalizeRoute("POST /api/dataset")).toBe("POST /api/dataset");
    expect(normalizeRoute("not-a-route")).toBe("not-a-route");
  });
});

describe("normalizeRoutes", () => {
  it("normalizes, dedupes, and sorts", () => {
    expect(
      normalizeRoutes([
        "GET /api/card/2",
        "GET /api/card/1",
        "POST /api/dataset",
      ]),
    ).toEqual(["GET /api/card/:id", "POST /api/dataset"]);
  });

  it("tolerates missing input", () => {
    expect(normalizeRoutes(undefined)).toEqual([]);
  });
});

describe("OpenAPI route table", () => {
  const table = buildRouteTable({
    paths: {
      "/api/card/{id}": { get: {}, put: {} },
      "/api/card/{id}/query": { post: {} },
      "/api/card/pivot": { post: {} },
      "/api/setting/{key}": { get: {}, parameters: [] },
      "/api/dataset": { post: {} },
    },
  });

  it("matches concrete paths to their shape", () => {
    expect(matchRoute(table, "GET", "/api/card/173")).toBe("/api/card/{id}");
    expect(matchRoute(table, "POST", "/api/card/173/query")).toBe(
      "/api/card/{id}/query",
    );
  });

  it("prefers literal segments over params, like a router", () => {
    expect(matchRoute(table, "POST", "/api/card/pivot")).toBe(
      "/api/card/pivot",
    );
  });

  it("matches non-numeric params the regex fallback cannot", () => {
    expect(matchRoute(table, "GET", "/api/setting/site-name")).toBe(
      "/api/setting/{key}",
    );
  });

  it("respects the method and returns null for unknown routes", () => {
    expect(matchRoute(table, "DELETE", "/api/card/173")).toBeNull();
    expect(matchRoute(table, "GET", "/api/unknown")).toBeNull();
  });

  it("ignores trailing slashes on captured paths", () => {
    expect(matchRoute(table, "GET", "/api/card/173/")).toBe("/api/card/{id}");
  });

  it("normalizeRoute uses the table, falling back to regexes", () => {
    expect(normalizeRoute("GET /api/setting/site-name", table)).toBe(
      "GET /api/setting/{key}",
    );
    expect(normalizeRoute("GET /api/unknown/173", table)).toBe(
      "GET /api/unknown/:id",
    );
  });

  it("buildRouteTable returns null for unusable specs", () => {
    expect(buildRouteTable(null)).toBeNull();
    expect(buildRouteTable({ paths: {} })).toBeNull();
  });
});

describe("fileExceedsBaseline", () => {
  it("is true when some function fired more than baseline", () => {
    expect(
      fileExceedsBaseline({ f: { 0: 2, 1: 1 } }, { f: { 0: 2, 1: 0 } }),
    ).toBe(true);
  });

  it("is false when every function matches baseline", () => {
    expect(fileExceedsBaseline({ f: { 0: 2 } }, { f: { 0: 2 } })).toBe(false);
  });

  it("treats a file absent from baseline as exceeding", () => {
    expect(fileExceedsBaseline({ f: { 0: 1 } }, undefined)).toBe(true);
  });
});

describe("discriminatingFiles", () => {
  it("relativizes surviving files and drops ones outside the repo", () => {
    const coverage = {
      "/repo/frontend/src/b.js": { f: { 0: 5 } },
      "/repo/frontend/src/a.js": { f: { 0: 1 } },
      "/elsewhere/c.js": { f: { 0: 1 } },
    };
    const baseline = {
      "/repo/frontend/src/a.js": { f: { 0: 1 } },
    };
    expect(discriminatingFiles(coverage, baseline, REPO_ROOT)).toEqual([
      "frontend/src/b.js",
    ]);
  });
});

describe("discriminatingFilesForTest", () => {
  const baselineDeltas = {
    "/repo/frontend/src/boot.js": { 0: 1, 1: 1 },
  };

  it("drops files whose deltas match single-visit boot noise", () => {
    const testDeltas = {
      "/repo/frontend/src/boot.js": { 0: 1, 1: 1 },
      "/repo/frontend/src/feature.js": { 3: 2 },
    };
    expect(
      discriminatingFilesForTest(testDeltas, baselineDeltas, REPO_ROOT),
    ).toEqual(["frontend/src/feature.js"]);
  });

  it("keeps boot files when they fired beyond baseline", () => {
    const testDeltas = {
      "/repo/frontend/src/boot.js": { 0: 3, 1: 1 },
    };
    expect(
      discriminatingFilesForTest(testDeltas, baselineDeltas, REPO_ROOT),
    ).toEqual(["frontend/src/boot.js"]);
  });

  it("handles missing deltas and files outside the repo", () => {
    expect(
      discriminatingFilesForTest(undefined, baselineDeltas, REPO_ROOT),
    ).toEqual([]);
    expect(
      discriminatingFilesForTest(
        { "/elsewhere/x.js": { 0: 1 } },
        baselineDeltas,
        REPO_ROOT,
      ),
    ).toEqual([]);
  });
});

describe("baselinePerTestDeltas", () => {
  it("merges attempts by max per function", () => {
    const baselineEntry = {
      tests: [
        { title: "t", f: { "/repo/a.js": { 0: 1, 1: 2 } }, routes: [] },
        { title: "t", f: { "/repo/a.js": { 0: 3 }, "/repo/b.js": { 0: 1 } } },
      ],
    };
    expect(baselinePerTestDeltas(baselineEntry)).toEqual({
      "/repo/a.js": { 0: 3, 1: 2 },
      "/repo/b.js": { 0: 1 },
    });
  });

  it("returns an empty map for entries without per-test data", () => {
    expect(baselinePerTestDeltas({ coverage: {} })).toEqual({});
    expect(baselinePerTestDeltas(undefined)).toEqual({});
  });
});
