import type { OnBeforeRequestHandlerConfig } from "metabase/plugins/oss/api";

import { apiRequestManipulationMiddleware } from "./middleware";

describe("apiRequestManipulationMiddleware", () => {
  it("should return the original data when there are no handlers", async () => {
    const inputData = {
      method: "GET" as const,
      url: "/api/test",
      headers: {},
      data: {},
    };

    const result = await apiRequestManipulationMiddleware([], inputData);
    expect(result).toEqual(inputData);
  });

  it("should return the original data when handler returns void", async () => {
    const inputData = {
      method: "POST" as const,
      url: "/api/test",
      headers: { "X-Test": "value" },
      data: {},
    };

    // Mock a handler that returns void
    const handler = jest.fn(async function () {
      return;
    });

    const result = await apiRequestManipulationMiddleware([handler], inputData);

    expect(result).toEqual(inputData);
    expect(handler).toHaveBeenCalledWith(inputData);
  });

  it("should update only the url when handler returns partial modification", async () => {
    const inputData = {
      method: "GET" as const,
      url: "/api/original",
      headers: {},
      data: {},
    };

    const expectedUrl = "/api/modified";

    const handler = jest.fn(async function () {
      // Simulate handler that only modifies URL
      return {
        url: expectedUrl,
      };
    });

    const result = await apiRequestManipulationMiddleware([handler], inputData);

    expect(result).toEqual({
      ...inputData,
      url: expectedUrl,
    });
  });

  it("should update method, url, and headers when handler returns full modification", async () => {
    const inputData = {
      method: "GET" as const,
      url: "/api/original",
      headers: {},
      data: {},
    };

    const modifications = {
      method: "POST" as const,
      url: "/api/modified",
      headers: { "X-Custom": "value" },
    };

    const handler = jest.fn(async function () {
      return modifications;
    });

    const result = await apiRequestManipulationMiddleware([handler], inputData);

    expect(result).toEqual({ ...inputData, ...modifications });
  });

  it("should merge headers properly when handler returns partial headers", async () => {
    const inputData = {
      method: "POST" as const,
      url: "/api/test",
      headers: { "X-Original": "value" },
      data: {},
    };

    const newHeaders = { "X-Modified": "new-value" };

    const handler = jest.fn(async function (
      data: OnBeforeRequestHandlerConfig,
    ) {
      return {
        headers: {
          ...data.headers,
          ...newHeaders,
        },
      };
    });

    const result = await apiRequestManipulationMiddleware([handler], inputData);

    expect(result.headers).toEqual({
      "X-Original": "value",
      "X-Modified": "new-value",
    });
  });

  it("should execute multiple handlers in order", async () => {
    const inputData = {
      method: "GET" as const,
      url: "/api/start",
      headers: {},
      data: { value: 0 },
    };

    const executionOrder: number[] = [];

    const handler1 = jest.fn(async (data: OnBeforeRequestHandlerConfig) => {
      executionOrder.push(1);
      return {
        ...data,
        url: data.url + "/step1",
        data: { ...data.data, value: (data.data.value as number) + 2 },
      };
    });

    const handler2 = jest.fn(async (data: OnBeforeRequestHandlerConfig) => {
      executionOrder.push(2);
      return {
        ...data,
        url: data.url + "/step2",
        data: { ...data.data, value: (data.data.value as number) * 10 },
      };
    });

    const handler3 = jest.fn(async (data: OnBeforeRequestHandlerConfig) => {
      executionOrder.push(3);
      return {
        ...data,
        url: data.url + "/step3",
        data: { ...data.data, value: (data.data.value as number) - 4 },
      };
    });

    const result = await apiRequestManipulationMiddleware(
      [handler1, handler2, handler3],
      inputData,
    );

    expect(executionOrder).toEqual([1, 2, 3]);
    expect(result.url).toBe("/api/start/step1/step2/step3");
    expect(result.data.value).toBe(16); // = ((0 + 2) * 10) - 4
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

  it("should preserve the original headers and data when handler does not modify them", async () => {
    const inputData = {
      method: "POST" as const,
      url: "/api/complex",
      headers: { "X-Custom": "header" },
      data: { keepMe: true },
    };

    const handler = jest.fn(async function () {
      return {
        url: "/api/modified-url",
      };
    });

    const result = await apiRequestManipulationMiddleware([handler], inputData);

    expect(result.url).toBe("/api/modified-url");
    expect(result.headers).toEqual(inputData.headers);
    expect(result.data).toEqual(inputData.data);
  });
});
