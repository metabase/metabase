import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";

function findColumn(query: Lib.Query, tableName: string, columnName: string) {
  const columns = Lib.filterableColumns(query, 0);
  return columnFinder(query, columns)(tableName, columnName);
}

function filterByStringColumn(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  const newQuery = Lib.filter(query, 0, filterClause);
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
    const tableName = "PRODUCTS";
    const columnName = "CATEGORY";

    it("should be able to create and destructure a string filter", () => {
      const { filterParts, columnInfo } = filterByStringColumn(
        query,
        Lib.stringFilterClause({
          operator: "=",
          column: findColumn(query, tableName, columnName),
          values: ["Gadget", "Widget"],
          options: {},
        }),
      );

      expect(filterParts).toMatchObject({
        operator: "=",
        column: expect.anything(),
        values: ["Gadget", "Widget"],
        options: {},
      });
      expect(columnInfo?.name).toBe(columnName);
    });

    it("should fill defaults for case sensitivity options", () => {
      const { filterParts, columnInfo } = filterByStringColumn(
        query,
        Lib.stringFilterClause({
          operator: "starts-with",
          column: findColumn(query, tableName, columnName),
          values: ["Gadget"],
          options: {},
        }),
      );

      expect(filterParts).toMatchObject({
        operator: "starts-with",
        column: expect.anything(),
        values: ["Gadget"],
        options: { "case-sensitive": false },
      });
      expect(columnInfo?.name).toBe(columnName);
    });

    it("should use provided case sensitivity options", () => {
      const { filterParts, columnInfo } = filterByStringColumn(
        query,
        Lib.stringFilterClause({
          operator: "starts-with",
          column: findColumn(query, tableName, columnName),
          values: ["Gadget"],
          options: { "case-sensitive": true },
        }),
      );

      expect(filterParts).toMatchObject({
        operator: "starts-with",
        column: expect.anything(),
        values: ["Gadget"],
        options: { "case-sensitive": true },
      });
      expect(columnInfo?.name).toBe(columnName);
    });

    it("should ignore case sensitivity options when they are not supported by the operator", () => {
      const { filterParts, columnInfo } = filterByStringColumn(
        query,
        Lib.stringFilterClause({
          operator: "=",
          column: findColumn(query, tableName, columnName),
          values: ["Gadget"],
          options: { "case-sensitive": true },
        }),
      );

      expect(filterParts).toMatchObject({
        operator: "=",
        column: expect.anything(),
        values: ["Gadget"],
        options: {},
      });
      expect(columnInfo?.name).toBe(columnName);
    });
  });
});
