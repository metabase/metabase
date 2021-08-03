import { state, ORDERS } from "__support__/sample_dataset_fixture";

import Table from "metabase-lib/lib/metadata/Table";
import Database from "metabase-lib/lib/metadata/Database";

import { getMetadata } from "metabase/selectors/metadata";

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
