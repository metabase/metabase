import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import Table from "metabase-lib/metadata/Table";
import Database from "metabase-lib/metadata/Database";

describe("Table", () => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });
  const table = metadata.table(ORDERS_ID);

  it("should be a table", () => {
    expect(table).toBeInstanceOf(Table);
  });

  it("should have a database", () => {
    expect(table.db).toBeInstanceOf(Database);
  });

  describe("date fields", () => {
    it("should return date fields", () => {
      expect(table.dateFields().length).toEqual(1);
    });
  });
});
