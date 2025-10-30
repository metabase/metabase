import fetchMock from "fetch-mock";

import api, { GET, POST } from "./api";

describe("api", () => {
  describe("on before request handlers", () => {
    beforeEach(() => {
      api.basename = "";
      api.onBeforeRequestHandlers = [];
    });

    describe("onBeforeRequestHandlers", () => {
      it("should execute handlers before making a request", async () => {
        const mockHandler = jest.fn().mockResolvedValue(undefined);
        api.onBeforeRequestHandlers.push({
          key: "test-handler",
          handler: mockHandler,
        });

        fetchMock.get("path:/api/test", { body: { data: "success" } });

        const testEndpoint = GET("/api/test");
        await testEndpoint();

        expect(mockHandler).toHaveBeenCalledWith({
          method: "GET",
          url: "/api/test",
          options: expect.objectContaining({
            headers: expect.any(Object),
            hasBody: false,
          }),
        });
      });

      it("should execute multiple handlers in order", async () => {
        const executionOrder: string[] = [];

        const handler1 = jest.fn().mockImplementation(async () => {
          executionOrder.push("handler1");
          return undefined;
        });

        const handler2 = jest.fn().mockImplementation(async () => {
          executionOrder.push("handler2");
          return undefined;
        });

        api.onBeforeRequestHandlers.push(
          { key: "handler1", handler: handler1 },
          { key: "handler2", handler: handler2 },
        );

        fetchMock.get("path:/api/test", { body: { data: "success" } });

        const testEndpoint = GET("/api/test");
        await testEndpoint();

        expect(executionOrder).toEqual(["handler1", "handler2"]);
        expect(handler1).toHaveBeenCalled();
        expect(handler2).toHaveBeenCalled();
      });

      it("should allow handlers to modify the URL", async () => {
        const mockHandler = jest.fn().mockResolvedValue({
          url: "/api/modified",
        });

        api.onBeforeRequestHandlers.push({
          key: "url-modifier",
          handler: mockHandler,
        });

        fetchMock.get("path:/api/modified", { body: { data: "modified" } });

        const testEndpoint = GET("/api/test");
        await testEndpoint();

        const calls = fetchMock.callHistory.calls();

        expect(calls[0].url).toContain("/api/modified");
      });

      it("should allow handlers to modify the method", async () => {
        const mockHandler = jest.fn().mockResolvedValue({
          method: "POST",
        });

        api.onBeforeRequestHandlers.push({
          key: "method-modifier",
          handler: mockHandler,
        });

        fetchMock.post("path:/api/test", { body: { data: "success" } });

        const testEndpoint = GET("/api/test");
        await testEndpoint();

        const calls = fetchMock.callHistory.calls();

        expect(calls[0].options.method).toBe("POST");
      });

      it("should allow handlers to modify request options by adding headers", async () => {
        const mockHandler = jest.fn().mockResolvedValue({
          options: {
            headers: {
              "X-Custom-Header": "custom-value",
            },
          },
        });

        api.onBeforeRequestHandlers.push({
          key: "options-modifier",
          handler: mockHandler,
        });

        fetchMock.get("path:/api/test-with-headers", {
          body: { data: "success" },
        });

        const testEndpoint = GET("/api/test-with-headers");
        await testEndpoint();

        const calls = fetchMock.callHistory.calls();
        const headers = calls[0].options.headers as Record<string, string>;

        expect(headers).toMatchObject({
          "x-custom-header": "custom-value",
        });
      });

      it("should allow handlers to override options from invocation", async () => {
        const mockHandler = jest.fn().mockResolvedValue({
          options: {
            headers: {
              "X-Handler-Header": "handler-value",
            },
          },
        });

        api.onBeforeRequestHandlers.push({
          key: "options-merger",
          handler: mockHandler,
        });

        fetchMock.get("path:/api/test-merge-opts", {
          body: { data: "success" },
        });

        const testEndpoint = GET("/api/test-merge-opts");
        await testEndpoint(
          {},
          { headers: { "X-Original-Header": "original" } },
        );

        const calls = fetchMock.callHistory.calls();
        const headers = calls[0].options.headers as Record<string, string>;

        expect(headers).toMatchObject({
          "x-handler-header": "handler-value",
        });
        // The original header from invocationOptions is overridden
        expect(headers["x-original-header"]).toBeUndefined();
      });

      it("should handle handlers that return nothing without modifying the request", async () => {
        const mockHandler = jest.fn().mockResolvedValue(undefined);

        api.onBeforeRequestHandlers.push({
          key: "void-handler",
          handler: mockHandler,
        });

        fetchMock.get("path:/api/test-no-change", {
          body: { data: "success" },
        });

        const testEndpoint = GET("/api/test-no-change");
        await testEndpoint();

        const calls = fetchMock.callHistory.calls();

        expect(mockHandler).toHaveBeenCalled();
        expect(calls[0].url).toContain("/api/test-no-change");
        expect(calls[0].options.method).toBe("GET");
      });

      it("should handle handlers that return partial modifications", async () => {
        const mockHandler = jest.fn().mockResolvedValue({
          url: "/api/new-url-only",
        });

        api.onBeforeRequestHandlers.push({
          key: "partial-modifier",
          handler: mockHandler,
        });

        fetchMock.get("path:/api/new-url-only", { body: { data: "success" } });

        const testEndpoint = GET("/api/test-original");
        await testEndpoint();

        const calls = fetchMock.callHistory.calls();

        expect(calls[0].url).toContain("/api/new-url-only");
        expect(calls[0].options.method).toBe("GET");
      });

      it("should apply modifications from multiple handlers cumulatively", async () => {
        const handler1 = jest.fn().mockResolvedValue({
          url: "/api/step1-url",
        });

        const handler2 = jest.fn().mockResolvedValue({
          url: "/api/step2-url",
        });

        api.onBeforeRequestHandlers.push(
          { key: "handler1", handler: handler1 },
          { key: "handler2", handler: handler2 },
        );

        // handler2's URL should win since it runs after handler1
        fetchMock.get("path:/api/step2-url", { body: { data: "success" } });

        const testEndpoint = GET("/api/original-url");
        await testEndpoint();

        const calls = fetchMock.callHistory.calls();

        expect(calls[0].url).toContain("/api/step2-url");
        expect(handler1).toHaveBeenCalled();
        expect(handler2).toHaveBeenCalledWith({
          method: "GET",
          url: "/api/step1-url",
          options: expect.any(Object),
        });
      });

      it("should work with POST requests and handlers", async () => {
        const mockHandler = jest.fn().mockResolvedValue(undefined);

        api.onBeforeRequestHandlers.push({
          key: "post-handler",
          handler: mockHandler,
        });

        fetchMock.post("path:/api/test-post", { body: { data: "success" } });

        const testEndpoint = POST("/api/test-post");
        await testEndpoint({ payload: "data" });

        expect(mockHandler).toHaveBeenCalledWith({
          method: "POST",
          url: "/api/test-post",
          options: expect.objectContaining({
            hasBody: true,
          }),
        });
      });

      it("should allow handlers to modify URL with path parameters", async () => {
        const mockHandler = jest.fn().mockResolvedValue({
          url: "/api/customers/:id/updated",
        });

        api.onBeforeRequestHandlers.push({
          key: "path-param-modifier",
          handler: mockHandler,
        });

        fetchMock.get("path:/api/customers/456/updated", {
          body: { data: "success" },
        });

        const testEndpoint = GET("/api/users/:id");
        await testEndpoint({ id: 456 });

        const calls = fetchMock.callHistory.calls();

        expect(calls[0].url).toContain("/api/customers/456/updated");
      });
    });

    describe("setOnBeforeRequestHandler", () => {
      beforeEach(() => {
        api.onBeforeRequestHandlers = [];
      });

      it("should add a new handler to the instance", () => {
        const mockHandler = jest.fn();
        const handlerDescription = {
          key: "new-handler",
          handler: mockHandler,
        };

        api.setOnBeforeRequestHandler(handlerDescription);

        expect(api.onBeforeRequestHandlers).toHaveLength(1);
        expect(api.onBeforeRequestHandlers[0]).toEqual(handlerDescription);
      });

      it("should replace an existing handler with the same key", () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();

        api.setOnBeforeRequestHandler({ key: "shared-key", handler: handler1 });
        expect(api.onBeforeRequestHandlers).toHaveLength(1);
        expect(api.onBeforeRequestHandlers[0].handler).toBe(handler1);

        api.setOnBeforeRequestHandler({ key: "shared-key", handler: handler2 });
        expect(api.onBeforeRequestHandlers).toHaveLength(1);
        expect(api.onBeforeRequestHandlers[0].handler).toBe(handler2);
      });

      it("should add multiple handlers with different keys", () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();
        const handler3 = jest.fn();

        api.setOnBeforeRequestHandler({ key: "handler1", handler: handler1 });
        api.setOnBeforeRequestHandler({ key: "handler2", handler: handler2 });
        api.setOnBeforeRequestHandler({ key: "handler3", handler: handler3 });

        expect(api.onBeforeRequestHandlers).toHaveLength(3);
        expect(api.onBeforeRequestHandlers[0].key).toBe("handler1");
        expect(api.onBeforeRequestHandlers[1].key).toBe("handler2");
        expect(api.onBeforeRequestHandlers[2].key).toBe("handler3");
      });

      it("should maintain order when replacing a handler", () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();
        const handler3 = jest.fn();
        const handler2Updated = jest.fn();

        api.setOnBeforeRequestHandler({ key: "handler1", handler: handler1 });
        api.setOnBeforeRequestHandler({ key: "handler2", handler: handler2 });
        api.setOnBeforeRequestHandler({ key: "handler3", handler: handler3 });

        api.setOnBeforeRequestHandler({
          key: "handler2",
          handler: handler2Updated,
        });

        expect(api.onBeforeRequestHandlers).toHaveLength(3);
        expect(api.onBeforeRequestHandlers[0].key).toBe("handler1");
        expect(api.onBeforeRequestHandlers[1].key).toBe("handler2");
        expect(api.onBeforeRequestHandlers[1].handler).toBe(handler2Updated);
        expect(api.onBeforeRequestHandlers[2].key).toBe("handler3");
      });
    });
  });
});
