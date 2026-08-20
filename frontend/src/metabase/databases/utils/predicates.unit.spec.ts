import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/utils/types";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { getHasDatabaseWithJsonEngine } from "./predicates";

const setup = (databases: Database[]) => {
  const metadata = createMockMetadata({ databases });
  return databases.map(({ id }) => checkNotNull(metadata.database(id)));
};

describe("metabase/databases/utils/predicates", () => {
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
