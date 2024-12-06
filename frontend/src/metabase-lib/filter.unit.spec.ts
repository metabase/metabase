import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createMockField } from "metabase-types/api/mocks";
import {
  PEOPLE_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

const PEOPLE_TABLE = createPeopleTable();

const BOOLEAN_FIELD = createMockField({
  id: 101,
  table_id: PEOPLE_ID,
  name: "IS_TRIAL",
  display_name: "Is Trial",
  base_type: "type/Boolean",
  effective_type: "type/Boolean",
  semantic_type: "type/Category",
});

const TIME_FIELD = createMockField({
  id: 102,
  table_id: PEOPLE_ID,
  name: "START_AT",
  display_name: "Start At",
  base_type: "type/Time",
  effective_type: "type/Time",
  semantic_type: null,
});

const UNKNOWN_FIELD = createMockField({
  id: 103,
  table_id: PEOPLE_ID,
  name: "UNKNOWN",
  display_name: "Unknown",
  base_type: "type/*",
  effective_type: "type/*",
  semantic_type: null,
});

const DATABASE = createSampleDatabase({
  tables: [
    createOrdersTable(),
    createProductsTable(),
    createReviewsTable(),
    createPeopleTable({
      fields: [
        ...(PEOPLE_TABLE.fields ?? []),
        BOOLEAN_FIELD,
        TIME_FIELD,
        UNKNOWN_FIELD,
      ],
    }),
  ],
});

const METADATA = createMockMetadata({
  databases: [DATABASE],
});

function findColumn(query: Lib.Query, tableName: string, columnName: string) {
  const columns = Lib.filterableColumns(query, 0);
  return columnFinder(query, columns)(tableName, columnName);
}

function addFilter<T extends Lib.FilterParts>(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
  getFilterParts: (
    query: Lib.Query,
    stageIndex: number,
    clause: Lib.FilterClause,
  ) => T | null,
) {
  const newQuery = Lib.filter(query, 0, filterClause);
  const [newFilterClause] = Lib.filters(newQuery, 0);
  const newFilterParts = getFilterParts(newQuery, 0, newFilterClause);
  const newColumnInfo = newFilterParts
    ? Lib.displayInfo(newQuery, 0, newFilterParts.column)
    : null;
  const newBucket = newFilterParts
    ? Lib.temporalBucket(newFilterParts?.column)
    : null;
  const newBucketInfo = newBucket
    ? Lib.displayInfo(newQuery, 0, newBucket)
    : null;

  return {
    newQuery,
    filterParts: newFilterParts,
    columnInfo: newColumnInfo,
    bucketInfo: newBucketInfo,
  };
}

function addDefaultFilter(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  return addFilter(query, filterClause, Lib.defaultFilterParts);
}

describe("filter", () => {
  const query = createQuery({ metadata: METADATA });

  describe("default filters", () => {
    it.each<Lib.DefaultFilterOperatorName>(["is-null", "not-null"])(
      'should be able to create and destructure a default filter with unknown column types and "%s" operator',
      operator => {
        const column = findColumn(query, "PEOPLE", UNKNOWN_FIELD.name);
        const { filterParts, columnInfo } = addDefaultFilter(
          query,
          Lib.defaultFilterClause({
            operator,
            column,
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
        });
        expect(columnInfo?.name).toBe(UNKNOWN_FIELD.name);
      },
    );

    it.each([
      {
        title: "a string column",
        tableName: "PRODUCTS",
        columnName: "CATEGORY",
      },
      {
        title: "a numeric column",
        tableName: "ORDERS",
        columnName: "TAX",
      },
      {
        title: "a date column",
        tableName: "ORDERS",
        columnName: "CREATED_AT",
      },
      {
        title: "a time column",
        tableName: "PEOPLE",
        columnName: TIME_FIELD.name,
      },
      {
        title: "a boolean column",
        tableName: "PEOPLE",
        columnName: BOOLEAN_FIELD.name,
      },
    ])(`should ignore filters with $title`, ({ tableName, columnName }) => {
      const column = findColumn(query, tableName, columnName);
      const { filterParts } = addDefaultFilter(
        query,
        Lib.expressionClause("is-null", [column]),
      );
      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with not supported operators", () => {
      const column = findColumn(query, "ORDERS", "TAX");
      const { filterParts } = addDefaultFilter(
        query,
        Lib.expressionClause("is-empty", [column]),
      );
      expect(filterParts).toBeNull();
    });
  });
});
