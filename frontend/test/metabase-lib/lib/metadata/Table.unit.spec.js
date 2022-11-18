import { state, ORDERS } from "__support__/sample_database_fixture";

import { getMetadata } from "metabase/selectors/metadata";
import Table from "metabase-lib/metadata/Table";
import Database from "metabase-lib/metadata/Database";

describe("Table", () => {
  const metadata = getMetadata(state);
  const table = metadata.table(ORDERS.id);

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
