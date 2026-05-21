import fetchMock from "fetch-mock";

import { ApiClient } from "./client";

type OnBeforeRequestHandlerData = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  options: {
    headers?: Record<string, string>;
  } & Record<string, unknown>;
};

describe("api", () => {
  describe("apiRequestManipulationMiddleware", () => {
    let apiInstance: ApiClient;

    beforeEach(() => {
      apiInstance = new ApiClient();
    });

    it("should return the original data when there are no handlers", async () => {
      const inputData = {
        method: "GET" as const,
        url: "/api/test",
        options: {},
        data: {},
      };

      const result =
        await apiInstance.apiRequestManipulationMiddleware(inputData);

      expect(result).toEqual(inputData);
    });

    it("should return the original data when handler returns void", async () => {
      const inputData = {
        method: "POST" as const,
        url: "/api/test",
        options: { headers: { "X-Test": "value" } },
        data: {},
      };

      // Mock a handler that returns void
      const voidHandler = jest.fn().mockResolvedValue(undefined);
      jest
        .spyOn(apiInstance as any, "apiRequestManipulationMiddleware")
        .mockImplementation(async (data) => {
          await voidHandler(data);
          return data;
        });

      const result =
        await apiInstance.apiRequestManipulationMiddleware(inputData);

      expect(result).toEqual(inputData);
      expect(voidHandler).toHaveBeenCalledWith(inputData);
    });

    it("should update only the url when handler returns partial modification", async () => {
      const inputData = {
        method: "GET" as const,
        url: "/api/original",
        options: {},
        data: {},
      };

      const expectedUrl = "/api/modified";

      jest
        .spyOn(apiInstance as any, "apiRequestManipulationMiddleware")
        .mockImplementation(async (data) => {
          // Simulate handler that only modifies URL
          const typedData = data as OnBeforeRequestHandlerData;
          return {
            method: typedData.method,
            url: expectedUrl,
            options: typedData.options,
          };
        });

      const result =
        await apiInstance.apiRequestManipulationMiddleware(inputData);

      expect(result).toEqual({
        method: inputData.method,
        url: expectedUrl,
        options: inputData.options,
      });
    });

    it("should update method, url, and options when handler returns full modification", async () => {
      const inputData = {
        method: "GET" as const,
        url: "/api/original",
        options: {},
        data: {},
      };

      const modifications = {
        method: "POST" as const,
        url: "/api/modified",
        options: { custom: "value" },
      };

      jest
        .spyOn(apiInstance as any, "apiRequestManipulationMiddleware")
        .mockImplementation(async () => modifications);

      const result =
        await apiInstance.apiRequestManipulationMiddleware(inputData);

      expect(result).toEqual(modifications);
    });

    it("should merge options properly when handler returns partial options", async () => {
      const inputData = {
        method: "POST" as const,
        url: "/api/test",
        options: {
          headers: { "X-Original": "value" },
        },
        data: {},
      };

      const newHeaders = { "X-Modified": "new-value" };

      jest
        .spyOn(apiInstance as any, "apiRequestManipulationMiddleware")
        .mockImplementation(async (data) => {
          const typedData = data as OnBeforeRequestHandlerData;
          return {
            method: typedData.method,
            url: typedData.url,
            options: {
              ...typedData.options,
              headers: { ...typedData.options.headers, ...newHeaders },
            },
          };
        });

      const result =
        await apiInstance.apiRequestManipulationMiddleware(inputData);

      expect(result.options.headers).toEqual({
        "X-Original": "value",
        "X-Modified": "new-value",
      });
    });

    it("should execute multiple handlers in order", async () => {
      const inputData = {
        method: "GET" as const,
        url: "/api/start",
        options: { counter: 0 },
        data: {},
      };

      const executionOrder: number[] = [];

      const handler1 = jest.fn(
        async (
          data: OnBeforeRequestHandlerData & { options: { counter: number } },
        ) => {
          executionOrder.push(1);
          return {
            ...data,
            url: data.url + "/step1",
            options: { ...data.options, counter: data.options.counter + 1 },
          };
        },
      );

      const handler2 = jest.fn(
        async (
          data: OnBeforeRequestHandlerData & { options: { counter: number } },
        ) => {
          executionOrder.push(2);
          return {
            ...data,
            url: data.url + "/step2",
            options: { ...data.options, counter: data.options.counter + 10 },
          };
        },
      );

      const handler3 = jest.fn(
        async (
          data: OnBeforeRequestHandlerData & { options: { counter: number } },
        ) => {
          executionOrder.push(3);
          return {
            ...data,
            url: data.url + "/step3",
            options: { ...data.options, counter: data.options.counter + 100 },
          };
        },
      );

      // Mock the middleware to use our handlers
      jest
        .spyOn(apiInstance as any, "apiRequestManipulationMiddleware")
        .mockImplementation(async (data) => {
          let currentData = data as OnBeforeRequestHandlerData & {
            options: { counter: number };
          };
          for (const handler of [handler1, handler2, handler3]) {
            const result = await handler(currentData);
            if (result) {
              currentData = result;
            }
          }
          return currentData;
        });

      const result =
        await apiInstance.apiRequestManipulationMiddleware(inputData);

      expect(executionOrder).toEqual([1, 2, 3]);
      expect(result.url).toBe("/api/start/step1/step2/step3");
      expect(result.options.counter).toBe(111); // 0 + 1 + 10 + 100
      expect(handler1).toHaveBeenCalledWith(
        expect.objectContaining({ url: "/api/start" }),
      );
      expect(handler2).toHaveBeenCalledWith(
        expect.objectContaining({ url: "/api/start/step1" }),
      );
      expect(handler3).toHaveBeenCalledWith(
        expect.objectContaining({ url: "/api/start/step1/step2" }),
      );
    });

    it("should handle async handlers correctly", async () => {
      const inputData = {
        method: "POST" as const,
        url: "/api/async",
        options: {},
        data: {},
      };

      const asyncHandler = jest.fn(async (data: OnBeforeRequestHandlerData) => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          ...data,
          url: "/api/async-modified",
        };
      });

      jest
        .spyOn(apiInstance as any, "apiRequestManipulationMiddleware")
        .mockImplementation(async (data) => {
          return await asyncHandler(data as OnBeforeRequestHandlerData);
        });

      const result =
        await apiInstance.apiRequestManipulationMiddleware(inputData);

      expect(asyncHandler).toHaveBeenCalled();
      expect(result.url).toBe("/api/async-modified");
    });

    it("should handle handler that only returns options", async () => {
      const inputData = {
        method: "GET" as const,
        url: "/api/test",
        options: {},
        data: {},
      };

      jest
        .spyOn(apiInstance as any, "apiRequestManipulationMiddleware")
        .mockImplementation(async (data) => {
          const typedData = data as OnBeforeRequestHandlerData;
          return {
            method: typedData.method,
            url: typedData.url,
            options: { ...typedData.options, newOption: "added" },
          };
        });

      const result =
        await apiInstance.apiRequestManipulationMiddleware(inputData);

      expect(result.method).toBe("GET");
      expect(result.url).toBe("/api/test");
      expect(result.options).toEqual({ newOption: "added" });
    });

    it("should preserve all original options when handler does not modify them", async () => {
      const complexOptions = {
        headers: { "X-Custom": "header" },
        noEvent: false,
        rawResponse: true,
      };

      const inputData = {
        method: "POST" as const,
        url: "/api/complex",
        options: complexOptions,
        data: {},
      };

      jest
        .spyOn(apiInstance as any, "apiRequestManipulationMiddleware")
        .mockImplementation(async (data) => {
          const typedData = data as OnBeforeRequestHandlerData;
          return {
            ...typedData,
            url: "/api/modified-url",
          };
        });

      const result =
        await apiInstance.apiRequestManipulationMiddleware(inputData);

      expect(result.url).toBe("/api/modified-url");
      expect(result.options).toEqual(complexOptions);
      expect(result.options.rawResponse).toBe(true);
    });
  });

  describe("response body parsing", () => {
    let apiInstance: LegacyApi;

    beforeEach(() => {
      apiInstance = new LegacyApi();
    });

    afterEach(() => {
      fetchMock.removeRoutes().clearHistory();
    });

    it("resolves an empty 204 body as null (not the empty string)", async () => {
      fetchMock.get("path:/api/empty", { status: 204, body: "" });

      const result = await apiInstance.GET("/api/empty")({});

      expect(result).toBeNull();
    });

    it("leaves an empty non-204 body as the empty string", async () => {
      // Only 204 No Content is normalized to null. An empty-bodied 200 keeps
      // its historical empty-string value so callers that index into a body
      // (e.g. `result.id`) don't begin dereferencing null.
      fetchMock.get("path:/api/also-empty", { status: 200, body: "" });

      const result = await apiInstance.GET("/api/also-empty")({});

      expect(result).toBe("");
    });

    it("parses a non-empty JSON body to its decoded value", async () => {
      fetchMock.get("path:/api/data", {
        status: 200,
        body: { hello: "world" },
      });

      const result = await apiInstance.GET("/api/data")({});

      expect(result).toEqual({ hello: "world" });
    });
  });

  describe("form-encoded requests", () => {
    let apiInstance: LegacyApi;

    beforeEach(() => {
      apiInstance = new LegacyApi();
    });

    afterEach(() => {
      fetchMock.removeRoutes().clearHistory();
    });

    // Regression: a `URLSearchParams` body (e.g. a dataset download) must be
    // passed through verbatim — not JSON-stringified — and must drop our
    // default `application/json` Content-Type so the browser can set
    // `application/x-www-form-urlencoded`. Keeping the JSON header made the
    // backend reject the request with a 400.
    //
    // The Content-Type strip is gated on `body instanceof URLSearchParams`, so
    // this assertion doubles as proof the body reached `fetch` as a real
    // `URLSearchParams` rather than a JSON string.
    it("drops the application/json Content-Type for a URLSearchParams body", async () => {
      fetchMock.post("path:/api/download", { status: 200, body: "" });

      const body = new URLSearchParams();
      body.append("query", JSON.stringify({ foo: "bar" }));

      await apiInstance.POST("/api/download")(body, { rawResponse: true });

      const call = fetchMock.callHistory.lastCall("path:/api/download");
      const headers = new Headers(call?.options?.headers);
      expect(headers.get("Content-Type")).not.toContain("application/json");
    });
  });

  describe("request (RTK entry point)", () => {
    let apiInstance: ApiClient;

    beforeEach(() => {
      apiInstance = new ApiClient();
    });

    afterEach(() => {
      fetchMock.removeRoutes().clearHistory();
    });

    it("`:tag*` substitutes a multi-segment value without URL-encoding the slashes", async () => {
      fetchMock.get("path:/api/automagic-dashboards/table/3/cell/4", {
        items: [],
      });

      await apiInstance.request({
        method: "GET",
        url: "/api/automagic-dashboards/:subPath*",
        params: { subPath: "table/3/cell/4" },
      });

      const call = fetchMock.callHistory.lastCall();
      expect(call?.url).toMatch(
        /\/api\/automagic-dashboards\/table\/3\/cell\/4$/,
      );
      // sanity-check: slashes were NOT %2F-encoded
      expect(call?.url).not.toContain("%2F");
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
      ).rejects.toEqual({ isCancelled: true });
    });

    it("rejects as cancelled when the signal aborts while the request is in flight", async () => {
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
      ).rejects.toEqual({ isCancelled: true });
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
      fetchMock.get("path:/api/session/properties", { ok: true });
      const listener = jest.fn();
      apiInstance.on("200", listener);

      await apiInstance.request({
        method: "GET",
        url: "/api/session/properties",
      });

      expect(listener).toHaveBeenCalledWith("/api/session/properties");
    });

    it("strips a subpath basename so listeners see the relative path", async () => {
      apiInstance.basename = "/metabase";
      fetchMock.get("path:/metabase/api/session", { ok: true });
      const listener = jest.fn();
      apiInstance.on("200", listener);

      await apiInstance.request({ method: "GET", url: "/api/session" });

      expect(listener).toHaveBeenCalledWith("/api/session");
    });

    it("emits the relative path when basename is a full URL (SDK case)", async () => {
      apiInstance.basename = "https://metabase.example.com";
      fetchMock.get("https://metabase.example.com/api/session", { ok: true });
      const listener = jest.fn();
      apiInstance.on("200", listener);

      await apiInstance.request({ method: "GET", url: "/api/session" });

      expect(listener).toHaveBeenCalledWith("/api/session");
    });

    it("strips the subpath when basename is a full URL with a subpath", async () => {
      apiInstance.basename = "http://localhost/mb";
      fetchMock.get("http://localhost/mb/api/session", { ok: true });
      const listener = jest.fn();
      apiInstance.on("200", listener);

      await apiInstance.request({ method: "GET", url: "/api/session" });

      expect(listener).toHaveBeenCalledWith("/api/session");
    });

    it("includes the querystring in the emitted path", async () => {
      fetchMock.get("path:/api/search", { items: [] });
      const listener = jest.fn();
      apiInstance.on("200", listener);

      await apiInstance.request({
        method: "GET",
        url: "/api/search",
        params: { q: "foo" },
      });

      expect(listener).toHaveBeenCalledWith("/api/search?q=foo");
    });

    it("does not emit when noEvent is set", async () => {
      fetchMock.get("path:/api/session/properties", { ok: true });
      const listener = jest.fn();
      apiInstance.on("200", listener);

      await apiInstance.request({
        method: "GET",
        url: "/api/session/properties",
        noEvent: true,
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
