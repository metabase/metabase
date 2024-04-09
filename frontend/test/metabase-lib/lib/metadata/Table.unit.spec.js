import { createMockMetadata } from "__support__/metadata";
import Database from "metabase-lib/v1/metadata/Database";
import Table from "metabase-lib/v1/metadata/Table";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

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
