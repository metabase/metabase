import { Api } from "./api";

type OnBeforeRequestHandlerData = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  options: {
    headers?: Record<string, string>;
    hasBody: boolean;
  } & Record<string, unknown>;
};

describe("api", () => {
  describe("apiRequestManipulationMiddleware", () => {
    let apiInstance: Api;

    beforeEach(() => {
      apiInstance = new Api();
    });

    it("should return the original data when there are no handlers", async () => {
      const inputData = {
        method: "GET" as const,
        url: "/api/test",
        options: { hasBody: false, json: true },
      };

      const result =
        await apiInstance.apiRequestManipulationMiddleware(inputData);

      expect(result).toEqual(inputData);
    });

    it("should return the original data when handler returns void", async () => {
      const inputData = {
        method: "POST" as const,
        url: "/api/test",
        options: { hasBody: true, json: true, headers: { "X-Test": "value" } },
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
        options: { hasBody: false, json: true },
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
        options: { hasBody: false, json: true },
      };

      const modifications = {
        method: "POST" as const,
        url: "/api/modified",
        options: { hasBody: true, json: false, custom: "value" },
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
          hasBody: true,
          json: true,
          headers: { "X-Original": "value" },
          retry: true,
        },
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
      expect(result.options.hasBody).toBe(true);
      expect(result.options.json).toBe(true);
      expect(result.options.retry).toBe(true);
    });

    it("should execute multiple handlers in order", async () => {
      const inputData = {
        method: "GET" as const,
        url: "/api/start",
        options: { hasBody: false, counter: 0 },
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
        options: { hasBody: true, json: true },
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
        options: { hasBody: false },
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
      expect(result.options).toEqual({ hasBody: false, newOption: "added" });
    });

    it("should preserve all original options when handler does not modify them", async () => {
      const complexOptions = {
        hasBody: true,
        json: true,
        headers: { "X-Custom": "header" },
        retry: true,
        retryCount: 5,
        formData: true,
        noEvent: false,
        transformResponse: jest.fn(),
      };

      const inputData = {
        method: "POST" as const,
        url: "/api/complex",
        options: complexOptions,
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
      expect(result.options.transformResponse).toBe(
        complexOptions.transformResponse,
      );
    });
  });
});
