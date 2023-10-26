import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";

function findColumn(query: Lib.Query, tableName: string, columnName: string) {
  const columns = Lib.filterableColumns(query, 0);
  return columnFinder(query, columns)(tableName, columnName);
}

function filterByStringColumn(
  query: Lib.Query,
  filterParts: Lib.StringFilterParts,
) {
  const newQuery = Lib.filter(query, 0, Lib.stringFilterClause(filterParts));
  const [newFilterClause] = Lib.filters(newQuery, 0);
  const newFilterParts = Lib.stringFilterParts(newQuery, 0, newFilterClause);
  const newColumnInfo =
    newFilterParts && Lib.displayInfo(newQuery, 0, newFilterParts.column);

  return {
    newQuery,
    filterParts: newFilterParts,
    columnInfo: newColumnInfo,
  };
}

describe("filter", () => {
  const query = createQuery();

  describe("string filters", () => {
    it("should be able to create and destructure a string filter", () => {
      const tableName = "PRODUCTS";
      const columnName = "CATEGORY";

      const { filterParts, columnInfo } = filterByStringColumn(query, {
        operator: "=",
        column: findColumn(query, tableName, columnName),
        values: ["Gadget", "Widget"],
        options: {},
      });

      expect(filterParts).toMatchObject({
        operator: "=",
        column: expect.anything(),
        values: ["Gadget", "Widget"],
        options: {},
      });
      expect(columnInfo?.name).toBe(columnName);
    });
  });
});
