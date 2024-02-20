import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import {
  getHasDataAccess,
  getHasDatabaseWithJsonEngine,
  getHasNativeWrite,
  getHasOwnDatabase,
} from "./data";

const setup = (databases: Database[]) => {
  const metadata = createMockMetadata({ databases });
  return databases.map(({ id }) => checkNotNull(metadata.database(id)));
};

describe("metabase/selectors/data", () => {
  describe("getHasDataAccess", () => {
    it("should return true if user has access to at least one database, even if it's the one with sample data", () => {
      const databases = setup([
        createMockDatabase({
          is_saved_questions: false,
        }),
      ]);

      expect(getHasDataAccess(databases)).toBe(true);
    });

    it("should return false if user does not have access to at least one real database", () => {
      const databases = setup([
        createMockDatabase({
          is_saved_questions: true,
        }),
      ]);

      expect(getHasDataAccess(databases)).toBe(false);
    });
  });

  describe("getHasOwnDatabase", () => {
    it("user has at least one database, and the one with sample data does not count", () => {
      const databases = setup([
        createMockDatabase({
          is_sample: false,
          is_saved_questions: false,
        }),
      ]);

      expect(getHasOwnDatabase(databases)).toBe(true);
    });

    it("user does not have their own database, and the one with sample data does not count", () => {
      const databases = setup([
        createMockDatabase({
          is_sample: true,
          is_saved_questions: true,
        }),
      ]);

      expect(getHasOwnDatabase(databases)).toBe(false);
    });
  });

  describe("getHasNativeWrite", () => {
    it("user has permissions to write to at least one database", () => {
      const databases = setup([
        createMockDatabase({
          native_permissions: "write",
        }),
      ]);

      expect(getHasNativeWrite(databases)).toBe(true);
    });

    it("user does not have permissions to write to at least one database", () => {
      const databases = setup([
        createMockDatabase({
          native_permissions: "none",
        }),
      ]);

      expect(getHasNativeWrite(databases)).toBe(false);
    });
  });

  describe("getHasDatabaseWithJsonEngine", () => {
    it("user has a json database", () => {
      const databases = setup([
        createMockDatabase({
          engine: "mongo",
        }),
      ]);

      expect(getHasDatabaseWithJsonEngine(databases)).toBe(true);
    });

    it("user does not have a json database", () => {
      const databases = setup([
        createMockDatabase({
          engine: "postgres",
        }),
      ]);

      expect(getHasDatabaseWithJsonEngine(databases)).toBe(false);
    });
  });
});
