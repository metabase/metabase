import { State } from "metabase-types/store";
import {
  getHasDataAccess,
  getHasOwnDatabase,
  getHasNativeWrite,
  getHasDatabaseWithJsonEngine,
} from "./data";

describe("metabase/selectors/data", () => {
  describe("getHasDataAccess", () => {
    it("should return true if user has data access", () => {
      const state = {
        entities: {
          databases: { databaseOne: { is_saved_questions: false } },
        },
      };

      expect(getHasDataAccess(state as any)).toBe(true);
    });

    it("should return false if user does not have data access", () => {
      const state = {
        entities: {
          databases: { databaseOne: { is_saved_questions: true } },
        },
      };

      expect(getHasDataAccess(state as any)).toBe(false);
    });
  });

  describe("getHasOwnDatabase", () => {
    it("should return true if user has their own database", () => {
      const state = {
        entities: {
          databases: {
            databaseOne: { is_sample: false, is_saved_questions: false },
          },
        },
      };

      expect(getHasOwnDatabase(state as any)).toBe(true);
    });

    it("should return false if user does not have their own database", () => {
      const state = {
        entities: {
          databases: {
            databaseOne: { is_sample: true, is_saved_questions: true },
          },
        },
      };

      expect(getHasOwnDatabase(state as any)).toBe(false);
    });
  });

  describe("getHasNativeWrite", () => {
    it("should return true if user has permissions to write to at least one database", () => {
      const state = {
        entities: {
          databases: {
            databaseOne: { native_permissions: "write" },
          },
        },
      };

      expect(getHasNativeWrite(state as any)).toBe(true);
    });

    it("should return false if user does not have permissions to write to at least one database", () => {
      const state = {
        entities: {
          databases: {
            databaseOne: { native_permissions: "read" },
          },
        },
      };

      expect(getHasNativeWrite(state as any)).toBe(false);
    });
  });

  describe("getHasDatabaseWithJsonEngine", () => {
    it("should return true if user has a json database", () => {
      const state = {
        entities: {
          databases: {
            databaseOne: { engine: "mongo" },
          },
        },
      };

      expect(getHasDatabaseWithJsonEngine(state as any)).toBe(true);
    });

    it("should return false if user does not have a json database", () => {
      const state = {
        entities: {
          databases: {
            databaseOne: { engine: "postgres" },
          },
        },
      };

      expect(getHasDatabaseWithJsonEngine(state as any)).toBe(false);
    });
  });
});
