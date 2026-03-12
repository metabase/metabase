import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { getHasDatabaseWithJsonEngine, getHasOwnDatabase } from "./data";

const setup = (databases: Database[]) => {
  const metadata = createMockMetadata({ databases });
  return databases.map(({ id }) => checkNotNull(metadata.database(id)));
};

describe("metabase/selectors/data", () => {
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
