import type { OnBeforeRequestHandlerConfig } from "metabase/plugins/oss/api";

import { apiRequestManipulationMiddleware } from "./middleware";

describe("apiRequestManipulationMiddleware", () => {
  it("should return the original data when there are no handlers", async () => {
    const inputData = {
      method: "GET" as const,
      url: "/api/test",
      options: {},
      data: {},
    };

    const result = await apiRequestManipulationMiddleware([], inputData);
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
      options: {},
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

    const handler = jest.fn(async function () {
      return modifications;
    });

    const result = await apiRequestManipulationMiddleware([handler], inputData);

    expect(result).toEqual({ ...inputData, ...modifications });
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

    const handler = jest.fn(async function (
      data: OnBeforeRequestHandlerConfig,
    ) {
      return {
        options: {
          headers: {
            ...data.options.headers,
            ...newHeaders,
          },
        },
      };
    });

    const result = await apiRequestManipulationMiddleware([handler], inputData);

    expect(result.options.headers).toEqual({
      "X-Original": "value",
      "X-Modified": "new-value",
    });
  });

  it("should execute multiple handlers in order", async () => {
    const inputData = {
      method: "GET" as const,
      url: "/api/start",
      options: { value: 0 },
      data: {},
    };

    const executionOrder: number[] = [];

    const handler1 = jest.fn(async (data: OnBeforeRequestHandlerConfig) => {
      executionOrder.push(1);
      return {
        ...data,
        url: data.url + "/step1",
        // @ts-expect-error: the type of options is unknown
        options: { ...data.options, value: data.options.value + 2 },
      };
    });

    const handler2 = jest.fn(async (data: OnBeforeRequestHandlerConfig) => {
      executionOrder.push(2);
      return {
        ...data,
        url: data.url + "/step2",
        // @ts-expect-error: the type of options is unknown
        options: { ...data.options, value: data.options.value * 10 },
      };
    });

    const handler3 = jest.fn(async (data: OnBeforeRequestHandlerConfig) => {
      executionOrder.push(3);
      return {
        ...data,
        url: data.url + "/step3",
        // @ts-expect-error: the type of options is unknown
        options: { ...data.options, value: data.options.value - 4 },
      };
    });

    const result = await apiRequestManipulationMiddleware(
      [handler1, handler2, handler3],
      inputData,
    );

    expect(executionOrder).toEqual([1, 2, 3]);
    expect(result.url).toBe("/api/start/step1/step2/step3");
    expect(result.options.value).toBe(16); // = ((0 + 2) * 10) - 4
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

  it("should preserve all original options when handler does not modify them", async () => {
    const complexOptions = {
      headers: { "X-Custom": "header" },
      noEvent: false,
      transformResponse: jest.fn(),
    };

    const inputData = {
      method: "POST" as const,
      url: "/api/complex",
      options: complexOptions,
      data: {},
    };

    const handler = jest.fn(async function () {
      return {
        url: "/api/modified-url",
      };
    });

    const result = await apiRequestManipulationMiddleware([handler], inputData);

    expect(result.url).toBe("/api/modified-url");
    expect(result.options).toEqual(complexOptions);
    expect(result.options.transformResponse).toBe(
      complexOptions.transformResponse,
    );
  });
});
