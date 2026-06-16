import fetchMock from "fetch-mock";

import { ApiClient } from "./client";

describe("api", () => {
  describe("request (RTK entry point)", () => {
    let apiInstance: ApiClient;

    beforeEach(() => {
      apiInstance = new ApiClient();
    });

    afterEach(() => {
      fetchMock.removeRoutes().clearHistory();
    });

    it("substitutes :tag URL placeholders from `params`", async () => {
      fetchMock.get("path:/api/card/123/params/abc-def/values", { values: [] });

      await apiInstance.request({
        method: "GET",
        url: "/api/card/:cardId/params/:paramId/values",
        params: { cardId: 123, paramId: "abc-def" },
      });

      const call = fetchMock.callHistory.lastCall();
      expect(call?.url).toMatch(/\/api\/card\/123\/params\/abc-def\/values$/);
    });

    it("appends leftover (non-template) `params` as querystring", async () => {
      fetchMock.post("path:/api/cache/invalidate", { count: 0 });

      await apiInstance.request({
        method: "POST",
        url: "/api/cache/invalidate",
        params: { include: "overrides", database: 1 },
      });

      const call = fetchMock.callHistory.lastCall();
      expect(call?.url).toContain("include=overrides");
      expect(call?.url).toContain("database=1");
      expect(call?.options?.body).toBeFalsy();
    });

    it("substitutes URL :tags and querystrings the leftover keys", async () => {
      fetchMock.get("path:/api/card/7/params/p/search/foo", { values: [] });

      await apiInstance.request({
        method: "GET",
        url: "/api/card/:cardId/params/:paramId/search/:query",
        params: {
          cardId: 7,
          paramId: "p",
          query: "foo",
          limit: 10,
        },
      });

      const call = fetchMock.callHistory.lastCall();
      expect(call?.url).toContain("/api/card/7/params/p/search/foo");
      expect(call?.url).toContain("limit=10");
    });

    it("sends `body` as JSON for POST", async () => {
      fetchMock.post("path:/api/card/42/query", { rows: [] });

      await apiInstance.request({
        method: "POST",
        url: "/api/card/:cardId/query",
        params: { cardId: 42 },
        body: { parameters: ["a"], ignore_cache: true },
      });

      const call = fetchMock.callHistory.lastCall();
      expect(call?.url).toMatch(/\/api\/card\/42\/query$/);
      expect(call?.options?.body).toBe(
        JSON.stringify({ parameters: ["a"], ignore_cache: true }),
      );
    });

    it("sends FormData bodies as-is and strips Content-Type", async () => {
      fetchMock.post("path:/api/table/9/append-csv", { success: true });

      const formData = new FormData();
      formData.append("file", new Blob(["a,b\n1,2"]), "x.csv");

      await apiInstance.request({
        method: "POST",
        url: "/api/table/:tableId/append-csv",
        params: { tableId: 9 },
        body: formData,
      });

      const call = fetchMock.callHistory.lastCall();
      // fetchMock serializes the body to string; presence/shape is sufficient.
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

    it("sends DELETE with a body", async () => {
      fetchMock.delete("path:/api/cache", {});

      await apiInstance.request({
        method: "DELETE",
        url: "/api/cache",
        body: { model: "question", model_id: [1, 2] },
      });

      const call = fetchMock.callHistory.lastCall();
      expect(call?.options?.body).toBe(
        JSON.stringify({ model: "question", model_id: [1, 2] }),
      );
    });

    it("folds body content into the querystring for GET", async () => {
      // Simulates the embed-override case (POST→GET transform): body content
      // must end up in the querystring since GET cannot carry a body.
      fetchMock.get("path:/api/card/5/query", { rows: [] });

      await apiInstance.request({
        method: "GET",
        url: "/api/card/:cardId/query",
        params: { cardId: 5 },
        body: { parameters: "[]" },
      });

      const call = fetchMock.callHistory.lastCall();
      expect(call?.url).toContain("/api/card/5/query");
      expect(call?.url).toContain("parameters=");
      expect(call?.options?.body).toBeFalsy();
    });

    it("lets a middleware-overridden URL substitute :tag tokens from the body (guest-embed flow regression)", async () => {
      // Regression for the guest-embed card-query flow (run-query.ts): the
      // saved-card query is dispatched through RTK with `token` in the *body*.
      // The embed override middleware rewrites `/api/card/:cardId/query` to
      // `/api/embed/card/:token/query` (POST→GET), and `:token` must be filled
      // from the body field — not just from URL params.
      fetchMock.get("path:/api/embed/card/SOME_JWT/query", { rows: [] });

      apiInstance.beforeRequestHandlers.push(async (config) => {
        if (config.url === "/api/card/:cardId/query") {
          return {
            ...config,
            method: "GET" as const,
            url: "/api/embed/card/:token/query",
          };
        }
        return config;
      });

      await apiInstance.request({
        method: "POST",
        url: "/api/card/:cardId/query",
        params: { cardId: 42 },
        body: { token: "SOME_JWT", parameters: "[]" },
      });

      const call = fetchMock.callHistory.lastCall();
      expect(call?.url).toMatch(/\/api\/embed\/card\/SOME_JWT\/query/);
      // The override changed the method to GET, so the leftover body field is
      // folded into the querystring (a GET request cannot carry a body).
      expect(call?.url).toContain("parameters=");
      expect(call?.options?.body).toBeFalsy();
    });

    it("omits params with undefined values from the querystring", async () => {
      fetchMock.get("path:/api/search", { items: [] });

      await apiInstance.request({
        method: "GET",
        url: "/api/search",
        params: { q: "foo", limit: undefined, offset: 0 },
      });

      const call = fetchMock.callHistory.lastCall();
      expect(call?.url).toContain("q=foo");
      expect(call?.url).toContain("offset=0");
      expect(call?.url).not.toContain("limit");
    });
  });

  describe("request cancellation", () => {
    let apiInstance: ApiClient;

    beforeEach(() => {
      apiInstance = new ApiClient();
    });

    afterEach(() => {
      fetchMock.removeRoutes().clearHistory();
    });

    // An already-aborted signal makes the real `fetch` reject before the request
    // is dispatched, so a request the caller has already cancelled never reaches
    // the server and never resolves with data. We can't assert the "never
    // dispatched" part here (fetch-mock records the attempt before honoring the
    // abort), but the cancelled rejection is the contract callers depend on.
    it("rejects an already-aborted request as cancelled", async () => {
      fetchMock.get("path:/api/card/1/query", { rows: [] });

      const controller = new AbortController();
      controller.abort();

      await expect(
        apiInstance.request({
          method: "GET",
          url: "/api/card/:cardId/query",
          params: { cardId: 1 },
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
    });

    it("rejects with AbortError when the signal aborts while the request is in flight", async () => {
      const controller = new AbortController();
      fetchMock.get("path:/api/card/1/query", async () => {
        controller.abort();
        return { rows: [] };
      });

      await expect(
        apiInstance.request({
          method: "GET",
          url: "/api/card/:cardId/query",
          params: { cardId: 1 },
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
    });

    // The retry path surfaces the signal's AbortError when a backoff is cut
    // short via `signal.throwIfAborted()`, which the client lets propagate
    // unchanged — same standard web shape as a mid-fetch abort.
    it("rejects with AbortError when the signal aborts during a retry backoff", async () => {
      jest.useFakeTimers();
      try {
        fetchMock.get("path:/api/card/1/query", { status: 503, body: {} });

        const controller = new AbortController();
        const promise = apiInstance
          .request({
            method: "GET",
            url: "/api/card/:cardId/query",
            params: { cardId: 1 },
            signal: controller.signal,
            retry: true,
          })
          .catch((error: unknown) => error);

        // Let the first attempt fail with 503 and schedule the backoff.
        await jest.advanceTimersByTimeAsync(0);

        // Aborting mid-backoff ends the wait early; the loop stops without
        // another attempt and the 503 never surfaces.
        controller.abort();
        await jest.runAllTimersAsync();

        expect(await promise).toMatchObject({ name: "AbortError" });
        expect(fetchMock.callHistory.calls()).toHaveLength(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("status-code event emit", () => {
    let apiInstance: ApiClient;

    beforeEach(() => {
      apiInstance = new ApiClient();
    });

    afterEach(() => {
      fetchMock.removeRoutes().clearHistory();
    });

    it("emits the relative path when basename is empty", async () => {
      fetchMock.get("path:/api/session/properties", { status: 401 });
      const listener = jest.fn();
      apiInstance.on(401, listener);

      await apiInstance
        .request({
          method: "GET",
          url: "/api/session/properties",
        })
        .catch(() => null);

      expect(listener).toHaveBeenCalledWith("/api/session/properties");
    });

    it("strips a subpath basename so listeners see the relative path", async () => {
      apiInstance.basename = "/metabase";
      fetchMock.get("path:/metabase/api/session", { status: 401 });
      const listener = jest.fn();
      apiInstance.on(401, listener);

      await apiInstance
        .request({ method: "GET", url: "/api/session" })
        .catch(() => null);

      expect(listener).toHaveBeenCalledWith("/api/session");
    });

    it("emits the relative path when basename is a full URL (SDK case)", async () => {
      apiInstance.basename = "https://metabase.example.com";
      fetchMock.get("https://metabase.example.com/api/session", {
        status: 401,
      });
      const listener = jest.fn();
      apiInstance.on(401, listener);

      await apiInstance
        .request({ method: "GET", url: "/api/session" })
        .catch(() => null);

      expect(listener).toHaveBeenCalledWith("/api/session");
    });

    it("strips the subpath when basename is a full URL with a subpath", async () => {
      apiInstance.basename = "http://localhost/mb";
      fetchMock.get("http://localhost/mb/api/session", { status: 401 });
      const listener = jest.fn();
      apiInstance.on(401, listener);

      await apiInstance
        .request({ method: "GET", url: "/api/session" })
        .catch(() => null);

      expect(listener).toHaveBeenCalledWith("/api/session");
    });

    it("includes the querystring in the emitted path", async () => {
      fetchMock.get("path:/api/search", { status: 401 });
      const listener = jest.fn();
      apiInstance.on(401, listener);

      await apiInstance
        .request({
          method: "GET",
          url: "/api/search",
          params: { q: "foo" },
        })
        .catch(() => null);

      expect(listener).toHaveBeenCalledWith("/api/search?q=foo");
    });

    it("does not emit when noEvent is set", async () => {
      fetchMock.get("path:/api/session/properties", { status: 401 });
      const listener = jest.fn();
      apiInstance.on(401, listener);

      await apiInstance
        .request({
          method: "GET",
          url: "/api/session/properties",
          noEvent: true,
        })
        .catch(() => null);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("response body parsing", () => {
    let apiInstance: ApiClient;

    beforeEach(() => {
      apiInstance = new ApiClient();
    });

    afterEach(() => {
      fetchMock.removeRoutes().clearHistory();
    });

    it("parses a JSON-typed body", async () => {
      fetchMock.get("path:/api/thing", {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { id: 1 },
      });

      await expect(
        apiInstance.request({ method: "GET", url: "/api/thing" }),
      ).resolves.toEqual({ id: 1 });
    });

    // A successful response we're told is JSON but can't parse isn't really a
    // success — fail loud at the source rather than resolve with a silent null
    // that NPEs somewhere downstream.
    it("throws when a successful JSON-typed body cannot be parsed", async () => {
      fetchMock.get("path:/api/thing", {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: "<html>not json</html>",
      });

      await expect(
        apiInstance.request({ method: "GET", url: "/api/thing" }),
      ).rejects.toThrow();
    });

    it("throws when a successful JSON-typed body is empty", async () => {
      fetchMock.get("path:/api/thing", {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: "",
      });

      await expect(
        apiInstance.request({ method: "GET", url: "/api/thing" }),
      ).rejects.toThrow();
    });

    // The regression this guards: an error response carrying a JSON content type
    // but an empty (or broken) body used to throw an opaque SyntaxError with no
    // `.status`, so downstream error handlers lost the HTTP status. It must
    // throw `{ status, data: null }` with the real status instead.
    it("throws the real status (not a SyntaxError) when an error body is empty but JSON-typed", async () => {
      fetchMock.get("path:/api/thing", {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: "",
      });

      await expect(
        apiInstance.request({ method: "GET", url: "/api/thing" }),
      ).rejects.toEqual({ status: 500, data: null });
    });

    it("throws the real status when an error body is malformed JSON", async () => {
      fetchMock.get("path:/api/thing", {
        status: 503,
        headers: { "Content-Type": "application/json" },
        body: "<html>gateway error</html>",
      });

      await expect(
        apiInstance.request({ method: "GET", url: "/api/thing" }),
      ).rejects.toEqual({ status: 503, data: null });
    });

    it("returns a non-JSON body as text", async () => {
      fetchMock.get("path:/api/thing", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
        body: "plain text",
      });

      await expect(
        apiInstance.request({ method: "GET", url: "/api/thing" }),
      ).resolves.toBe("plain text");
    });
  });
});
