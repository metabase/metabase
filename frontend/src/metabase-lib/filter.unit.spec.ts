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
import {
  columnFinder,
  createQuery,
  findTemporalBucket,
} from "metabase-lib/test-helpers";

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

function addStringFilter(query: Lib.Query, filterClause: Lib.ExpressionClause) {
  return addFilter(query, filterClause, Lib.stringFilterParts);
}

function addNumberFilter(query: Lib.Query, filterClause: Lib.ExpressionClause) {
  return addFilter(query, filterClause, Lib.numberFilterParts);
}

function addCoordinateFilter(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  const { newQuery, filterParts, columnInfo } = addFilter(
    query,
    filterClause,
    Lib.coordinateFilterParts,
  );
  const longitudeColumnInfo = filterParts?.longitudeColumn
    ? Lib.displayInfo(newQuery, 0, filterParts.longitudeColumn)
    : null;

  return { newQuery, filterParts, columnInfo, longitudeColumnInfo };
}

function addBooleanFilter(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  return addFilter(query, filterClause, Lib.booleanFilterParts);
}

function addSpecificDateFilter(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  return addFilter(query, filterClause, Lib.specificDateFilterParts);
}

function addRelativeDateFilter(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  return addFilter(query, filterClause, Lib.relativeDateFilterParts);
}

function addExcludeDateFilter(
  query: Lib.Query,
  filterClause: Lib.ExpressionClause,
) {
  return addFilter(query, filterClause, Lib.excludeDateFilterParts);
}

function addTimeFilter(query: Lib.Query, filterClause: Lib.ExpressionClause) {
  return addFilter(query, filterClause, Lib.timeFilterParts);
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
        const { filterParts, columnInfo } = addStringFilter(
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
        const { filterParts, columnInfo } = addStringFilter(
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
        const { filterParts, columnInfo } = addStringFilter(
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
        const { filterParts, columnInfo } = addStringFilter(
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
      const { filterParts, columnInfo } = addStringFilter(
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
        const { filterParts, columnInfo } = addStringFilter(
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
        const { filterParts, columnInfo } = addStringFilter(
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
      const { filterParts } = addStringFilter(
        query,
        Lib.expressionClause("concat", [
          findColumn(query, tableName, columnName),
          "A",
        ]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = addStringFilter(
        query,
        Lib.expressionClause("=", ["A", column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-string arguments", () => {
      const { filterParts } = addStringFilter(
        query,
        Lib.expressionClause("=", [column, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with incorrect column type", () => {
      const { filterParts } = addStringFilter(
        query,
        Lib.stringFilterClause({
          operator: "=",
          column: findColumn(query, tableName, "PRICE"),
          values: ["A"],
          options: {},
        }),
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
        const { filterParts, columnInfo } = addNumberFilter(
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
        const { filterParts, columnInfo } = addNumberFilter(
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
        const { filterParts, columnInfo } = addNumberFilter(
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
        const { filterParts, columnInfo } = addNumberFilter(
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
      const { filterParts } = addNumberFilter(
        query,
        Lib.expressionClause("+", [
          findColumn(query, tableName, columnName),
          10,
        ]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = addNumberFilter(
        query,
        Lib.expressionClause("=", [10, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-numeric arguments", () => {
      const { filterParts } = addNumberFilter(
        query,
        Lib.expressionClause("=", [column, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with incorrect column type", () => {
      const { filterParts } = addNumberFilter(
        query,
        Lib.numberFilterClause({
          operator: "=",
          column: findColumn(query, tableName, "CREATED_AT"),
          values: [10],
        }),
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
        const { filterParts, columnInfo } = addCoordinateFilter(
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
        const { filterParts, columnInfo } = addCoordinateFilter(
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
        const { filterParts, columnInfo } = addCoordinateFilter(
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
        addCoordinateFilter(
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
        addCoordinateFilter(
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
      const { filterParts } = addCoordinateFilter(
        query,
        Lib.expressionClause("+", [
          findColumn(query, tableName, columnName),
          10,
        ]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = addCoordinateFilter(
        query,
        Lib.expressionClause("=", [10, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-numeric arguments", () => {
      const { filterParts } = addCoordinateFilter(
        query,
        Lib.expressionClause("=", [column, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with incorrect column type", () => {
      const { filterParts } = addCoordinateFilter(
        query,
        Lib.coordinateFilterClause({
          operator: "=",
          column: findColumn(query, tableName, "CREATED_AT"),
          values: [10],
        }),
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
        const { filterParts, columnInfo } = addBooleanFilter(
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
        const { filterParts, columnInfo } = addBooleanFilter(
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
      const { filterParts } = addBooleanFilter(
        query,
        Lib.expressionClause("!=", [
          findColumn(query, tableName, columnName),
          true,
        ]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = addBooleanFilter(
        query,
        Lib.expressionClause("=", [true, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-boolean arguments", () => {
      const { filterParts } = addBooleanFilter(
        query,
        Lib.expressionClause("=", [column, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with incorrect column type", () => {
      const { filterParts } = addBooleanFilter(
        query,
        Lib.booleanFilterClause({
          operator: "=",
          column: findColumn(query, tableName, "CREATED_AT"),
          values: [true],
        }),
      );

      expect(filterParts).toBeNull();
    });
  });

  describe("specific date filters", () => {
    const tableName = "PRODUCTS";
    const columnName = "CREATED_AT";
    const column = findColumn(query, tableName, columnName);

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2020, 0, 1));
    });

    it.each<Lib.SpecificDateFilterOperatorName>(["=", ">", "<"])(
      'should be able to create and destructure a specific date filter with "%s" operator and 1 value',
      operator => {
        const values = [new Date(2018, 2, 10)];
        const { filterParts, columnInfo, bucketInfo } = addSpecificDateFilter(
          query,
          Lib.specificDateFilterClause(query, 0, {
            operator,
            column,
            values,
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values,
        });
        expect(columnInfo?.name).toBe(columnName);
        expect(bucketInfo).toBe(null);
      },
    );

    it('should be able to create and destructure a specific date filter with "between" operator and 2 values', () => {
      const values = [new Date(2018, 2, 10), new Date(2019, 10, 20)];
      const { filterParts, columnInfo, bucketInfo } = addSpecificDateFilter(
        query,
        Lib.specificDateFilterClause(query, 0, {
          operator: "between",
          column,
          values,
        }),
      );

      expect(filterParts).toMatchObject({
        operator: "between",
        column: expect.anything(),
        values,
      });
      expect(columnInfo?.name).toBe(columnName);
      expect(bucketInfo).toBe(null);
    });

    it.each<Lib.SpecificDateFilterOperatorName>(["=", ">", "<"])(
      'should remove an existing temporal bucket with "%s" operator and 1 value',
      operator => {
        const values = [new Date(2018, 2, 10)];
        const { filterParts, columnInfo, bucketInfo } = addSpecificDateFilter(
          query,
          Lib.specificDateFilterClause(query, 0, {
            operator,
            column: Lib.withTemporalBucket(
              column,
              findTemporalBucket(query, column, "Day"),
            ),
            values,
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values,
        });
        expect(columnInfo?.name).toBe(columnName);
        expect(bucketInfo).toBe(null);
      },
    );

    it('should remove an existing temporal bucket with "between" operator and 2 values', () => {
      const values = [new Date(2018, 2, 10), new Date(2019, 10, 20)];
      const { filterParts, columnInfo, bucketInfo } = addSpecificDateFilter(
        query,
        Lib.specificDateFilterClause(query, 0, {
          operator: "between",
          column: Lib.withTemporalBucket(
            column,
            findTemporalBucket(query, column, "Hour"),
          ),
          values,
        }),
      );

      expect(filterParts).toMatchObject({
        operator: "between",
        column: expect.anything(),
        values,
      });
      expect(columnInfo?.name).toBe(columnName);
      expect(bucketInfo).toBe(null);
    });

    it.each<Lib.SpecificDateFilterOperatorName>(["=", ">", "<"])(
      'should set "minute" temporal bucket with "%s" operator and 1 value if there are time parts',
      operator => {
        const values = [new Date(2018, 2, 10, 30)];
        const { filterParts, columnInfo, bucketInfo } = addSpecificDateFilter(
          query,
          Lib.specificDateFilterClause(query, 0, {
            operator,
            column,
            values,
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values,
        });
        expect(columnInfo?.name).toBe(columnName);
        expect(bucketInfo?.shortName).toBe("minute");
      },
    );

    it('should set "minute" temporal bucket with "between" operator and 1 value if there are time parts', () => {
      const values = [new Date(2018, 2, 10), new Date(2019, 10, 20, 15)];
      const { filterParts, columnInfo, bucketInfo } = addSpecificDateFilter(
        query,
        Lib.specificDateFilterClause(query, 0, {
          operator: "between",
          column,
          values,
        }),
      );

      expect(filterParts).toMatchObject({
        operator: "between",
        column: expect.anything(),
        values,
      });
      expect(columnInfo?.name).toBe(columnName);
      expect(bucketInfo?.shortName).toBe("minute");
    });

    it.each([
      ["yyyy-MM-DDTHH:mm:ssZ", "2020-01-05T10:20:00+01:00"],
      ["yyyy-MM-DDTHH:mm:ss", "2020-01-05T10:20:00"],
      ["yyyy-MM-DD", "2020-01-05"],
    ])("should support %s date format", (format, arg) => {
      const { filterParts } = addSpecificDateFilter(
        query,
        Lib.expressionClause("=", [column, arg]),
      );
      expect(filterParts).toMatchObject({
        operator: "=",
        column: expect.anything(),
        values: [expect.any(Date)],
      });

      const value = filterParts?.values[0];
      expect(value?.getFullYear()).toBe(2020);
      expect(value?.getMonth()).toBe(0);
      expect(value?.getDate()).toBe(5);
    });

    it.each([
      ["yyyy-MM-DDTHH:mm:ssZ", "2020-01-05T10:20:00+04:00"],
      ["yyyy-MM-DDTHH:mm:ss", "2020-01-05T10:20:00"],
    ])("should support %s datetime format", (format, arg) => {
      const { filterParts } = addSpecificDateFilter(
        query,
        Lib.expressionClause("=", [column, arg]),
      );
      expect(filterParts).toMatchObject({
        operator: "=",
        column: expect.anything(),
        values: [expect.any(Date)],
      });

      const value = filterParts?.values[0];
      expect(value?.getFullYear()).toBe(2020);
      expect(value?.getMonth()).toBe(0);
      expect(value?.getDate()).toBe(5);
      expect(value?.getHours()).toBe(10);
      expect(value?.getMinutes()).toBe(20);
    });

    it("should ignore expressions with not supported operators", () => {
      const { filterParts } = addSpecificDateFilter(
        query,
        Lib.expressionClause("!=", [column, "2020-01-01"]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = addSpecificDateFilter(
        query,
        Lib.expressionClause("=", ["2020-01-01", column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-time arguments", () => {
      const { filterParts } = addSpecificDateFilter(
        query,
        Lib.expressionClause("=", [column, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with incorrect column type", () => {
      const { filterParts } = addSpecificDateFilter(
        query,
        Lib.specificDateFilterClause(query, 0, {
          operator: "=",
          column: findColumn(query, tableName, "PRICE"),
          values: [new Date(2020, 1, 1)],
        }),
      );

      expect(filterParts).toBeNull();
    });
  });

  describe("relative date filters", () => {
    const tableName = "PRODUCTS";
    const columnName = "CREATED_AT";
    const column = findColumn(query, tableName, columnName);

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2020, 0, 1));
    });

    it.each<[number | "current", Lib.RelativeDateBucketName]>([
      [-1, "minute"],
      [1, "minute"],
      ["current", "minute"],
      [-2, "hour"],
      [2, "hour"],
      ["current", "hour"],
      [-3, "day"],
      [3, "day"],
      ["current", "day"],
      [-4, "week"],
      [4, "week"],
      ["current", "week"],
      [-5, "month"],
      [5, "month"],
      ["current", "month"],
      [-6, "quarter"],
      [6, "quarter"],
      ["current", "quarter"],
      [-7, "year"],
      [7, "year"],
      ["current", "year"],
    ])(
      "should be able to create and destructure a relative date filter without offset",
      (value, bucket) => {
        const { filterParts, columnInfo } = addRelativeDateFilter(
          query,
          Lib.relativeDateFilterClause({
            column,
            value,
            bucket,
            offsetValue: null,
            offsetBucket: null,
            options: {},
          }),
        );

        expect(filterParts).toMatchObject({
          column: expect.anything(),
          value,
          bucket,
          offsetValue: null,
          offsetBucket: null,
          options: {},
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<
      [
        number | "current",
        Lib.RelativeDateBucketName,
        number,
        Lib.RelativeDateBucketName,
      ]
    >([
      [-1, "minute", -10, "minute"],
      [1, "minute", 10, "hour"],
      [-2, "hour", -20, "hour"],
      [2, "hour", 20, "day"],
      [-3, "day", -30, "day"],
      [3, "day", 30, "week"],
      [-4, "week", -40, "week"],
      [4, "week", 40, "quarter"],
      [-5, "month", -50, "month"],
      [5, "month", 50, "year"],
      [-6, "quarter", -60, "quarter"],
      [6, "quarter", 60, "month"],
      [-7, "year", -70, "year"],
      [7, "year", 70, "year"],
    ])(
      "should be able to create and destructure a relative date filter with an offset",
      (value, bucket, offsetValue, offsetBucket) => {
        const { filterParts, columnInfo } = addRelativeDateFilter(
          query,
          Lib.relativeDateFilterClause({
            column,
            value,
            bucket,
            offsetValue,
            offsetBucket,
            options: {},
          }),
        );

        expect(filterParts).toMatchObject({
          column: expect.anything(),
          value,
          bucket,
          offsetValue,
          offsetBucket,
          options: {},
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it("should remove an existing temporal bucket from a column", () => {
      const { filterParts, bucketInfo } = addRelativeDateFilter(
        query,
        Lib.relativeDateFilterClause({
          column: Lib.withTemporalBucket(
            column,
            findTemporalBucket(query, column, "Year"),
          ),
          value: 1,
          bucket: "day",
          offsetValue: null,
          offsetBucket: null,
          options: {},
        }),
      );

      expect(filterParts).toBeDefined();
      expect(bucketInfo).toBeNull();
    });

    it("should remove an existing temporal bucket from a column with an offset", () => {
      const { filterParts } = addRelativeDateFilter(
        query,
        Lib.relativeDateFilterClause({
          column: Lib.withTemporalBucket(
            column,
            findTemporalBucket(query, column, "Month"),
          ),
          value: 1,
          bucket: "day",
          offsetValue: 2,
          offsetBucket: "month",
          options: {},
        }),
      );

      const bucket = filterParts
        ? Lib.temporalBucket(filterParts?.column)
        : null;
      expect(filterParts).toBeDefined();
      expect(bucket).toBeNull();
    });

    it("should ignore expressions with not supported operators", () => {
      const { filterParts } = addRelativeDateFilter(
        query,
        Lib.expressionClause("=", [column, "2020-01-01"]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = addRelativeDateFilter(
        query,
        Lib.expressionClause("time-interval", ["current", column, "day"]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-time arguments", () => {
      const { filterParts } = addRelativeDateFilter(
        query,
        Lib.expressionClause("time-interval", [column, column, "day"]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with incorrect column type", () => {
      const { filterParts } = addRelativeDateFilter(
        query,
        Lib.relativeDateFilterClause({
          column: findColumn(query, tableName, "PRICE"),
          value: 1,
          bucket: "day",
          offsetValue: null,
          offsetBucket: null,
          options: {},
        }),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with offset and incorrect column type", () => {
      const { filterParts } = addRelativeDateFilter(
        query,
        Lib.relativeDateFilterClause({
          column: findColumn(query, tableName, "PRICE"),
          value: 1,
          bucket: "day",
          offsetValue: 1,
          offsetBucket: "day",
          options: {},
        }),
      );

      expect(filterParts).toBeNull();
    });
  });

  describe("exclude date filters", () => {
    const tableName = "PRODUCTS";
    const columnName = "CREATED_AT";
    const column = findColumn(query, tableName, columnName);

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2020, 0, 1));
    });

    it.each<Lib.ExcludeDateBucketName>([
      "hour-of-day",
      "day-of-week",
      "month-of-year",
      "quarter-of-year",
    ])(
      'should be able to create and destructure an exclude date filter with "%s" bucket and multiple values',
      bucket => {
        const { filterParts, columnInfo } = addExcludeDateFilter(
          query,
          Lib.excludeDateFilterClause(query, 0, {
            operator: "!=",
            column,
            bucket,
            values: [1, 2],
          }),
        );

        expect(filterParts).toMatchObject({
          operator: "!=",
          column: expect.anything(),
          bucket,
          values: [1, 2],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.ExcludeDateFilterOperatorName>(["is-null", "not-null"])(
      'should be able to create and destructure an exclude date filter with "%s" operator without values',
      operator => {
        const { filterParts, columnInfo } = addExcludeDateFilter(
          query,
          Lib.excludeDateFilterClause(query, 0, {
            operator,
            column,
            bucket: null,
            values: [],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          bucket: null,
          values: [],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<Lib.ExcludeDateFilterOperatorName>(["is-null", "not-null"])(
      'should remove an existing temporal bucket with "%s" operator',
      operator => {
        const { filterParts, columnInfo } = addExcludeDateFilter(
          query,
          Lib.excludeDateFilterClause(query, 0, {
            operator,
            column: Lib.withTemporalBucket(
              column,
              findTemporalBucket(query, column, "Minute"),
            ),
            bucket: null,
            values: [],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          bucket: null,
          values: [],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it.each<[Lib.ExcludeDateBucketName, number[], Lib.ExpressionArg[]]>([
      ["hour-of-day", [10, 20], [10, 20]],
      ["day-of-week", [1, 2, 3], ["2019-12-30", "2019-12-31", "2020-01-01"]],
      ["month-of-year", [0, 2], ["2020-01-01", "2020-03-01"]],
      ["quarter-of-year", [1, 4], ["2020-01-01", "2020-10-01"]],
    ])(
      'should properly serialize values for "%s" bucket',
      (bucket, values, args) => {
        const filter = Lib.excludeDateFilterClause(query, 0, {
          operator: "!=",
          column,
          bucket,
          values,
        });

        const filterParts = Lib.expressionParts(query, 0, filter);
        expect(filterParts.args).toMatchObject([expect.anything(), ...args]);
      },
    );

    it("should ignore expressions with not supported operators", () => {
      const { filterParts } = addExcludeDateFilter(
        query,
        Lib.expressionClause("=", [column, "2020-01-01"]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = addExcludeDateFilter(
        query,
        Lib.expressionClause("!=", ["2020-01-01", column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-time arguments", () => {
      const { filterParts } = addExcludeDateFilter(
        query,
        Lib.expressionClause("!=", [column, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with incorrect column type", () => {
      const { filterParts } = addExcludeDateFilter(
        query,
        Lib.excludeDateFilterClause(query, 0, {
          operator: "!=",
          column: findColumn(query, tableName, "PRICE"),
          bucket: "day-of-week",
          values: [1, 2],
        }),
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
      jest.setSystemTime(new Date(2020, 0, 1));
    });

    it.each<Lib.TimeFilterOperatorName>([">", "<"])(
      'should be able to create and destructure a time filter with "%s" operator and 1 value',
      operator => {
        const { filterParts, columnInfo } = addTimeFilter(
          query,
          Lib.timeFilterClause({
            operator,
            column,
            values: [new Date(2015, 0, 1, 10, 20)],
          }),
        );

        expect(filterParts).toMatchObject({
          operator,
          column: expect.anything(),
          values: [new Date(2020, 0, 1, 10, 20)],
        });
        expect(columnInfo?.name).toBe(columnName);
      },
    );

    it('should be able to create and destructure a time filter with "between" operator and 2 values', () => {
      const { filterParts, columnInfo } = addTimeFilter(
        query,
        Lib.timeFilterClause({
          operator: "between",
          column,
          values: [new Date(2015, 0, 1, 10, 20), new Date(2015, 0, 1, 18, 50)],
        }),
      );

      expect(filterParts).toMatchObject({
        operator: "between",
        column: expect.anything(),
        values: [new Date(2020, 0, 1, 10, 20), new Date(2020, 0, 1, 18, 50)],
      });
      expect(columnInfo?.name).toBe(columnName);
    });

    it.each([
      ["HH:mm:ss.sss[Z]", "11:08:13.1313Z"],
      ["HH:mm:SS.sss", "11:08:13.1313"],
      ["HH:mm:SS", "11:08:13"],
      ["HH:mm", "11:08"],
    ])("should support %s time format", (format, arg) => {
      const { filterParts } = addTimeFilter(
        query,
        Lib.expressionClause(">", [column, arg]),
      );
      expect(filterParts).toMatchObject({
        operator: ">",
        column: expect.anything(),
        values: [expect.any(Date)],
      });

      const value = filterParts?.values[0];
      expect(value?.getHours()).toBe(11);
      expect(value?.getMinutes()).toBe(8);
    });

    it("should ignore expressions with not supported operators", () => {
      const { filterParts } = addTimeFilter(
        query,
        Lib.expressionClause("=", [column, "10:20:00.000"]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions without first column", () => {
      const { filterParts } = addTimeFilter(
        query,
        Lib.expressionClause(">", ["10:20:00.000", column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with non-time arguments", () => {
      const { filterParts } = addTimeFilter(
        query,
        Lib.expressionClause(">", [column, column]),
      );

      expect(filterParts).toBeNull();
    });

    it("should ignore expressions with incorrect column type", () => {
      const { filterParts } = addTimeFilter(
        query,
        Lib.timeFilterClause({
          operator: "between",
          column: findColumn(query, tableName, "CREATED_AT"),
          values: [new Date(2015, 0, 1, 10, 20), new Date(2015, 0, 1, 18, 50)],
        }),
      );

      expect(filterParts).toBeNull();
    });
  });
});
