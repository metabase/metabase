import { createMockField } from "metabase-types/api/mocks";
import {
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
  PEOPLE_ID,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";

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

const DATABASE = createSampleDatabase({
  tables: [
    createOrdersTable(),
    createProductsTable(),
    createReviewsTable(),
    createPeopleTable({
      fields: [...(PEOPLE_TABLE.fields ?? []), BOOLEAN_FIELD, TIME_FIELD],
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

function filterByColumn<T extends Lib.FilterParts>(
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

  return {
    newQuery,
    filterParts: newFilterParts,
    columnInfo: newColumnInfo,
  };
}

function filterByStringColumn(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  return filterByColumn(query, filterClause, Lib.stringFilterParts);
}

function filterByNumberColumn(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  return filterByColumn(query, filterClause, Lib.numberFilterParts);
}

function filterByCoordinateColumn(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  const { newQuery, filterParts, columnInfo } = filterByColumn(
    query,
    filterClause,
    Lib.coordinateFilterParts,
  );
  const longitudeColumnInfo = filterParts?.longitudeColumn
    ? Lib.displayInfo(newQuery, 0, filterParts.longitudeColumn)
    : null;

  return { newQuery, filterParts, columnInfo, longitudeColumnInfo };
}

function filterByBooleanColumn(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  return filterByColumn(query, filterClause, Lib.booleanFilterParts);
}

function filterByTimeColumn(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  return filterByColumn(query, filterClause, Lib.timeFilterParts);
}

describe("filter", () => {
  const query = createQuery({ metadata: METADATA });

  describe("string filters", () => {
    const tableName = "PRODUCTS";
    const columnName = "CATEGORY";
    const column = findColumn(query, tableName, columnName);

    it.each<Lib.StringFilterOperatorName>([
      "=",
      "!=",
      "contains",
      "does-not-contain",
      "starts-with",
      "ends-with",
    ])(
      'should be able to create and destructure a string filter with "%s" operator and 1 value',
      operator => {
        const { filterParts, columnInfo } = filterByStringColumn(
          query,
          Lib.stringFilterClause({
            operator,
            column,
            values: ["Gadget"],
            options: {},
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: ["Gadget"],
          options: {},
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.StringFilterOperatorName>(["=", "!="])(
      'should be able to create and destructure a string filter with "%s" operator and multiple values',
      operator => {
        const { filterParts, columnInfo } = filterByStringColumn(
          query,
          Lib.stringFilterClause({
            operator,
            column,
            values: ["Gadget", "Widget"],
            options: {},
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: ["Gadget", "Widget"],
          options: {},
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.StringFilterOperatorName>([
      "is-null",
      "not-null",
      "is-empty",
      "not-empty",
    ])(
      'should be able to create and destructure a string filter with "%s" operator without values',
      operator => {
        const { filterParts, columnInfo } = filterByStringColumn(
          query,
          Lib.stringFilterClause({
            operator,
            column,
            values: [],
            options: {},
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [],
          options: {},
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.StringFilterOperatorName>([
      "contains",
      "does-not-contain",
      "starts-with",
      "ends-with",
    ])(
      'should fill defaults for case sensitivity options for "%s" operator',
      () => {
        const { filterParts, columnInfo } = filterByStringColumn(
          query,
          Lib.stringFilterClause({
            operator: "starts-with",
            column,
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
      },
    );

    it.each<Lib.StringFilterOperatorName>([
      "contains",
      "does-not-contain",
      "starts-with",
      "ends-with",
    ])('should use provided case sensitivity options for "%s" operator', () => {
      const { filterParts, columnInfo } = filterByStringColumn(
        query,
        Lib.stringFilterClause({
          operator: "starts-with",
          column,
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

    it.each<Lib.StringFilterOperatorName>(["=", "!="])(
      'should ignore case sensitivity options as they are not supported by "%s" operator and 1 value',
      operator => {
        const { filterParts, columnInfo } = filterByStringColumn(
          query,
          Lib.stringFilterClause({
            operator,
            column,
            values: ["Gadget"],
            options: { "case-sensitive": true },
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: ["Gadget"],
          options: {},
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.StringFilterOperatorName>([
      "is-null",
      "not-null",
      "is-empty",
      "not-empty",
    ])(
      'should ignore case sensitivity options as they are not supported by "%s" operator without values',
      operator => {
        const { filterParts, columnInfo } = filterByStringColumn(
          query,
          Lib.stringFilterClause({
            operator,
            column,
            values: [],
            options: { "case-sensitive": true },
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [],
          options: {},
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it("should ignore expressions with not supported operators", () => {
      const { filterParts } = filterByStringColumn(
        query,
        Lib.expressionClause("concat", [
          findColumn(query, tableName, columnName),
          "A",
        ]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = filterByStringColumn(
        query,
        Lib.expressionClause("=", ["A", column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-string arguments", () => {
      const { filterParts } = filterByStringColumn(
        query,
        Lib.expressionClause("=", [column, column]),
      );

      expect(filterParts).toBeNull();
    });
  });

  describe("number filters", () => {
    const tableName = "ORDERS";
    const columnName = "TOTAL";
    const column = findColumn(query, tableName, columnName);

    it.each<Lib.NumberFilterOperatorName>(["=", "!=", ">", ">", ">=", "<="])(
      'should be able to create and destructure a number filter with "%s" operator and 1 value',
      operator => {
        const { filterParts, columnInfo } = filterByNumberColumn(
          query,
          Lib.numberFilterClause({
            operator,
            column,
            values: [10],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [10],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.NumberFilterOperatorName>(["=", "!="])(
      'should be able to create and destructure a number filter with "%s" operator and multiple values',
      operator => {
        const { filterParts, columnInfo } = filterByNumberColumn(
          query,
          Lib.numberFilterClause({
            operator,
            column,
            values: [1, 2, 3],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [1, 2, 3],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.NumberFilterOperatorName>(["between"])(
      'should be able to create and destructure a number filter with "%s" operator and exactly 2 values',
      operator => {
        const { filterParts, columnInfo } = filterByNumberColumn(
          query,
          Lib.numberFilterClause({
            operator,
            column,
            values: [1, 2],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [1, 2],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.NumberFilterOperatorName>(["is-null", "not-null"])(
      'should be able to create and destructure a number filter with "%s" operator without values',
      operator => {
        const { filterParts, columnInfo } = filterByNumberColumn(
          query,
          Lib.numberFilterClause({
            operator,
            column,
            values: [],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it("should ignore expressions with not supported operators", () => {
      const { filterParts } = filterByNumberColumn(
        query,
        Lib.expressionClause("starts-with", [
          findColumn(query, tableName, columnName),
          "A",
        ]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = filterByNumberColumn(
        query,
        Lib.expressionClause("=", [10, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-string arguments", () => {
      const { filterParts } = filterByNumberColumn(
        query,
        Lib.expressionClause("=", [column, column]),
      );

      expect(filterParts).toBeNull();
    });
  });

  describe("coordinate filters", () => {
    const tableName = "PEOPLE";
    const columnName = "LATITUDE";
    const column = findColumn(query, tableName, columnName);

    it.each<Lib.CoordinateFilterOperatorName>([
      "=",
      "!=",
      ">",
      ">",
      ">=",
      "<=",
    ])(
      'should be able to create and destructure a coordinate filter with "%s" operator and 1 value',
      operator => {
        const { filterParts, columnInfo } = filterByCoordinateColumn(
          query,
          Lib.coordinateFilterClause({
            operator,
            column,
            values: [10],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [10],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.CoordinateFilterOperatorName>(["=", "!="])(
      'should be able to create and destructure a coordinate filter with "%s" operator and multiple values',
      operator => {
        const { filterParts, columnInfo } = filterByCoordinateColumn(
          query,
          Lib.coordinateFilterClause({
            operator,
            column,
            values: [1, 2, 3],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [1, 2, 3],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.CoordinateFilterOperatorName>(["between"])(
      'should be able to create and destructure a coordinate filter with "%s" operator and exactly 2 values',
      operator => {
        const { filterParts, columnInfo } = filterByCoordinateColumn(
          query,
          Lib.coordinateFilterClause({
            operator,
            column,
            values: [1, 2],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [1, 2],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it('should be able to create and destructure a coordinate filter with "inside" operator and 1 column', () => {
      const { filterParts, columnInfo, longitudeColumnInfo } =
        filterByCoordinateColumn(
          query,
          Lib.coordinateFilterClause({
            operator: "inside",
            column,
            values: [1, 2, 3, 4],
          }),
        );

      expect(filterParts).toMatchObject({
        operator: "inside",
        column: expect.anything(),
        longitudeColumn: expect.anything(),
        values: [1, 2, 3, 4],
      });
      expect(columnInfo?.name).toBe(columnName);
      expect(longitudeColumnInfo?.name).toBe(columnName);
    });

    it('should be able to create and destructure a coordinate filter with "inside" operator and 2 columns', () => {
      const { filterParts, columnInfo, longitudeColumnInfo } =
        filterByCoordinateColumn(
          query,
          Lib.coordinateFilterClause({
            operator: "inside",
            column,
            longitudeColumn: findColumn(query, tableName, "LONGITUDE"),
            values: [1, 2, 3, 4],
          }),
        );

      expect(filterParts).toMatchObject({
        operator: "inside",
        column: expect.anything(),
        longitudeColumn: expect.anything(),
        values: [1, 2, 3, 4],
      });
      expect(columnInfo?.name).toBe(columnName);
      expect(longitudeColumnInfo?.name).toBe("LONGITUDE");
    });

    it("should ignore expressions with not supported operators", () => {
      const { filterParts } = filterByCoordinateColumn(
        query,
        Lib.expressionClause("starts-with", [
          findColumn(query, tableName, columnName),
          "A",
        ]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = filterByCoordinateColumn(
        query,
        Lib.expressionClause("=", [10, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-string arguments", () => {
      const { filterParts } = filterByCoordinateColumn(
        query,
        Lib.expressionClause("=", [column, column]),
      );

      expect(filterParts).toBeNull();
    });
  });

  describe("boolean filters", () => {
    const tableName = "PEOPLE";
    const columnName = BOOLEAN_FIELD.name;
    const column = findColumn(query, tableName, columnName);

    it.each([true, false])(
      'should be able to create and destructure a boolean filter with "=" operator and a "%s" value',
      value => {
        const { filterParts, columnInfo } = filterByBooleanColumn(
          query,
          Lib.booleanFilterClause({
            operator: "=",
            column,
            values: [value],
          }),
        );

        expect(filterParts).toMatchObject({
          operator: "=",
          column: expect.anything(),
          values: [value],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.BooleanFilterOperatorName>(["is-null", "not-null"])(
      'should be able to create and destructure a boolean filter with "%s" operator without values',
      operator => {
        const { filterParts, columnInfo } = filterByBooleanColumn(
          query,
          Lib.booleanFilterClause({
            operator,
            column,
            values: [],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it("should ignore expressions with not supported operators", () => {
      const { filterParts } = filterByBooleanColumn(
        query,
        Lib.expressionClause("starts-with", [
          findColumn(query, tableName, columnName),
          "A",
        ]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = filterByBooleanColumn(
        query,
        Lib.expressionClause("=", [true, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-string arguments", () => {
      const { filterParts } = filterByBooleanColumn(
        query,
        Lib.expressionClause("=", [column, column]),
      );

      expect(filterParts).toBeNull();
    });
  });

  describe("time filters", () => {
    const tableName = "PEOPLE";
    const columnName = TIME_FIELD.name;
    const column = findColumn(query, tableName, columnName);

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2015, 0, 1));
    });

    it.each<Lib.TimeFilterOperatorName>([">", "<"])(
      'should be able to create and destructure a time filter with "%s" operator and 1 value',
      operator => {
        const { filterParts, columnInfo } = filterByTimeColumn(
          query,
          Lib.timeFilterClause({
            operator,
            column,
            values: [new Date(2020, 0, 1, 10, 20)],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [new Date(2015, 0, 1, 10, 20)],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );
  });
});
