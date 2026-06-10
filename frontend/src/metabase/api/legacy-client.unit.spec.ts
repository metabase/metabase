import fetchMock from "fetch-mock";

import { api } from "./client";
import { GET, POST } from "./legacy-client";

describe("legacy-client", () => {
  afterEach(() => {
    fetchMock.removeRoutes().clearHistory();
    api.beforeRequestHandlers = [];
  });

  it("substitutes URL :tags from rawData and routes the remainder to the JSON body for POST", async () => {
    fetchMock.post("path:/api/card/42/query", { rows: [] });

    await POST("/api/card/:cardId/query")({
      cardId: 42,
      parameters: ["a"],
      ignore_cache: true,
    });

    const call = fetchMock.callHistory.lastCall();
    expect(call?.url).toMatch(/\/api\/card\/42\/query$/);
    expect(call?.url).not.toContain("parameters=");
    expect(call?.options?.body).toBe(
      JSON.stringify({ parameters: ["a"], ignore_cache: true }),
    );
  });

  it("substitutes URL :tags from rawData and routes the remainder to the querystring for GET", async () => {
    fetchMock.get("path:/api/card/7/params/p/values", { values: [] });

    await GET("/api/card/:cardId/params/:paramId/values")({
      cardId: 7,
      paramId: "p",
      limit: 10,
    });

    const call = fetchMock.callHistory.lastCall();
    expect(call?.url).toContain("/api/card/7/params/p/values");
    expect(call?.url).toContain("limit=10");
    expect(call?.options?.body).toBeFalsy();
  });

  it("sends FormData bodies as-is and strips Content-Type", async () => {
    fetchMock.post("path:/api/table/9/append-csv", { success: true });

    const formData = new FormData();
    formData.append("file", new Blob(["a,b\n1,2"]), "x.csv");

    await POST("/api/table/9/append-csv")(formData);

    const call = fetchMock.callHistory.lastCall();
    const sentHeaders = call?.options?.headers as
      | Record<string, string>
      | Headers
      | undefined;
    const contentType =
      sentHeaders instanceof Headers
        ? sentHeaders.get("Content-Type")
        : sentHeaders?.["Content-Type"];
    expect(contentType).toBeFalsy();
  });

  it("lets a middleware-overridden URL substitute :tag tokens from any rawData field (embed flow regression)", async () => {
    // Regression for the guest-embed flow: legacy `CardApi.query(rawData)` is
    // called with `{ token, parameters, ... }`. The embed URL override
    // middleware rewrites `/api/card/:cardId/query` to
    // `/api/embed/card/:token/query`, and `:token` must be filled from the
    // (body-shaped) `token` field of the bag — not just from URL params.
    fetchMock.get("path:/api/embed/card/SOME_JWT/query", { rows: [] });

    api.beforeRequestHandlers.push(async (config) => {
      if (config.url === "/api/card/:cardId/query") {
        return {
          ...config,
          method: "GET" as const,
          url: "/api/embed/card/:token/query",
        };
      }
      return config;
    });

    await POST("/api/card/:cardId/query")({
      token: "SOME_JWT",
      parameters: "[]",
    });

    const call = fetchMock.callHistory.lastCall();
    expect(call?.url).toMatch(/\/api\/embed\/card\/SOME_JWT\/query/);
    // The override-changed method is GET, so leftover bag fields are folded
    // into the querystring (a GET request cannot carry a body).
    expect(call?.url).toContain("parameters=");
    expect(call?.options?.body).toBeFalsy();
  });
});
