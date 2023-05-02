import {
  fetchDataOrError,
  hasDatabaseActionsEnabled,
  syncParametersAndEmbeddingParams,
} from "metabase/dashboard/utils";
import { createMockDatabase } from "metabase-types/api/mocks";

const ENABLED_ACTIONS_DATABASE = createMockDatabase({
  id: 1,
  settings: { "database-enable-actions": true },
});
const DISABLED_ACTIONS_DATABASE = createMockDatabase({
  id: 2,
  settings: { "database-enable-actions": false },
});
const NO_ACTIONS_DATABASE = createMockDatabase({ id: 3 });

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

    it("should return true if a database has model actions enabled", () => {
      expect(hasDatabaseActionsEnabled(ENABLED_ACTIONS_DATABASE)).toBe(true);
    });

    it("should return false if a database does not have model actions enabled or is undefined", () => {
      expect(hasDatabaseActionsEnabled(DISABLED_ACTIONS_DATABASE)).toBe(false);
      expect(hasDatabaseActionsEnabled(NO_ACTIONS_DATABASE)).toBe(false);
    });

    it("should return true if any database has actions enabled", () => {
      const databases = [
        ENABLED_ACTIONS_DATABASE,
        DISABLED_ACTIONS_DATABASE,
        NO_ACTIONS_DATABASE,
      ];

      const result = databases.some(hasDatabaseActionsEnabled);
      expect(result).toBe(true);
    });

    it("should return false if all databases have actions disabled", () => {
      const databases = [DISABLED_ACTIONS_DATABASE, NO_ACTIONS_DATABASE];

      const result = databases.some(hasDatabaseActionsEnabled);
      expect(result).toBe(false);
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
