import {
  fetchDataOrError,
  isDatabaseActionEnabled,
  syncParametersAndEmbeddingParams,
} from "metabase/dashboard/utils";
import { createMockDatabase } from "metabase-types/api/mocks";

describe("Dashboard utils", () => {
  describe("fetchDataOrError()", () => {
    it("should return data on successful fetch", async () => {
      const data = {
        series: [1, 2, 3],
      };

      const successfulFetch = Promise.resolve(data);

      const result = await fetchDataOrError(successfulFetch);

      expect(result.error).toBeUndefined();
      expect(result).toEqual(data);
    });

    it("should return map with error key on failed fetch", async () => {
      const error = {
        status: 504,
        statusText: "GATEWAY_TIMEOUT",
        data: {
          message:
            "Failed to load resource: the server responded with a status of 504 (GATEWAY_TIMEOUT)",
        },
      };

      const failedFetch = Promise.reject(error);

      const result = await fetchDataOrError(failedFetch);
      expect(result.error).toEqual(error);
    });

    it("should return true if any database has actions enabled", () => {
      const dbData = [
        { id: 1, settings: { "database-enable-actions": true } },
        { id: 2, settings: { "database-enable-actions": true } },
        { id: 3, settings: { "database-enable-actions": false } },
      ];

      const databases = dbData.map(createMockDatabase);

      const result = databases.some(isDatabaseActionEnabled());
      expect(result).toBe(true);
    });
  });

  describe("syncParametersAndEmbeddingParams", () => {
    it("should rename `embedding_parameters` that are renamed in `parameters`", () => {
      const before = {
        embedding_params: { id: "required" },
        parameters: [{ slug: "id", id: "unique-param-id" }],
      };
      const after = {
        parameters: [{ slug: "new_id", id: "unique-param-id" }],
      };

      const expectation = { new_id: "required" };

      const result = syncParametersAndEmbeddingParams(before, after);
      expect(result).toEqual(expectation);
    });

    it("should remove `embedding_parameters` that are removed from `parameters`", () => {
      const before = {
        embedding_params: { id: "required" },
        parameters: [{ slug: "id", id: "unique-param-id" }],
      };
      const after = {
        parameters: [],
      };

      const expectation = {};

      const result = syncParametersAndEmbeddingParams(before, after);
      expect(result).toEqual(expectation);
    });

    it("should not change `embedding_parameters` when `parameters` hasn't changed", () => {
      const before = {
        embedding_params: { id: "required" },
        parameters: [{ slug: "id", id: "unique-param-id" }],
      };
      const after = {
        parameters: [{ slug: "id", id: "unique-param-id" }],
      };

      const expectation = { id: "required" };

      const result = syncParametersAndEmbeddingParams(before, after);
      expect(result).toEqual(expectation);
    });
  });
});
