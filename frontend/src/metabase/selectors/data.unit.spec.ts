import { createMockState } from "metabase-types/store/mocks";
import { createMockDatabase } from "metabase-types/api/mocks";
import {
  getHasDataAccess,
  getHasOwnDatabase,
  getHasNativeWrite,
  getHasDatabaseWithJsonEngine,
} from "./data";

const mockedDatabase = createMockDatabase();

describe("metabase/selectors/data", () => {
  describe("getHasDataAccess", () => {
    it("should return true if user has access to at least one database, even if it's the one with sample data", () => {
      const state = createMockState({
        entities: {
          databases: {
            0: { ...mockedDatabase, is_saved_questions: false },
          },
        },
      });

      expect(getHasDataAccess(state)).toBe(true);
    });

    it("should return false if user does not have access to at least one real database", () => {
      const state = createMockState({
        entities: {
          databases: {
            0: { ...mockedDatabase, is_saved_questions: true },
          },
        },
      });

      expect(getHasDataAccess(state)).toBe(false);
    });
  });

  describe("getHasOwnDatabase", () => {
    it("user has at least one database, and the one with sample data does not count", () => {
      const state = createMockState({
        entities: {
          databases: {
            0: {
              ...mockedDatabase,
              is_sample: false,
              is_saved_questions: false,
            },
          },
        },
      });

      expect(getHasOwnDatabase(state)).toBe(true);
    });

    it("user does not have their own database, and the one with sample data does not count", () => {
      const state = createMockState({
        entities: {
          databases: {
            0: { ...mockedDatabase, is_sample: true, is_saved_questions: true },
          },
        },
      });

      expect(getHasOwnDatabase(state)).toBe(false);
    });
  });

  describe("getHasNativeWrite", () => {
    it("user has permissions to write to at least one database", () => {
      const state = createMockState({
        entities: {
          databases: {
            0: { ...mockedDatabase, native_permissions: "write" },
          },
        },
      });

      expect(getHasNativeWrite(state)).toBe(true);
    });

    it("user does not have permissions to write to at least one database", () => {
      const state = createMockState({
        entities: {
          databases: {
            0: { ...mockedDatabase, native_permissions: "read" },
          },
        },
      });

      expect(getHasNativeWrite(state)).toBe(false);
    });
  });

  describe("getHasDatabaseWithJsonEngine", () => {
    it("user has a json database", () => {
      const state = createMockState({
        entities: {
          databases: {
            0: { ...mockedDatabase, engine: "mongo" },
          },
        },
      });

      expect(getHasDatabaseWithJsonEngine(state)).toBe(true);
    });

    it("user does not have a json database", () => {
      const state = createMockState({
        entities: {
          databases: {
            0: { ...mockedDatabase, engine: "postgres" },
          },
        },
      });

      expect(getHasDatabaseWithJsonEngine(state)).toBe(false);
    });
  });
});
