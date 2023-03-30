import {
  SAMPLE_DATABASE,
  ANOTHER_DATABASE,
  ORDERS,
  PRODUCTS,
  MAIN_METRIC_ID,
  createMetadata,
} from "__support__/sample_database_fixture";

import Segment from "metabase-lib/metadata/Segment";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Question from "metabase-lib/Question";

function makeDatasetQuery(query = {}) {
  return {
    type: "query",
    database: SAMPLE_DATABASE.id,
    query: {
      "source-table": query["source-query"] ? undefined : ORDERS.id,
      ...query,
    },
  };
}

function makeQuery(query) {
  return new StructuredQuery(ORDERS.question(), makeDatasetQuery(query));
}

function makeQueryWithAggregation(agg) {
  return makeQuery({ aggregation: [agg] });
}

function makeQueryWithoutNumericFields() {
  const virtualCardId = "card__123";

  const questionDetail = {
    display: "table",
    visualization_settings: {},
    dataset_query: {
      type: "query",
      database: SAMPLE_DATABASE.id,
      query: {
        "source-table": virtualCardId,
      },
    },
  };

  const metadata = createMetadata(state => {
    const tableWithWithoutNumericFields = {
      id: virtualCardId,
      db_id: SAMPLE_DATABASE.id,
      fields: [ORDERS.ID.id, ORDERS.CREATED_AT.id],
    };
    return state.assocIn(
      ["entities", "tables", virtualCardId],
      tableWithWithoutNumericFields,
    );
  });

  return new Question(questionDetail, metadata).query();
}

// no numeric fields, but have linked table (FK) with a numeric field
function makeQueryWithLinkedTable() {
  const tableId = "card__123";

  const questionDetail = {
    display: "table",
    visualization_settings: {},
    dataset_query: {
      type: "query",
      database: SAMPLE_DATABASE.id,
      query: {
        "source-table": tableId,
      },
    },
  };

  const metadata = createMetadata(state => {
    const tableWithWithoutNumericFields = {
      id: tableId,
      db_id: SAMPLE_DATABASE.id,
      fields: [ORDERS.ID.id, ORDERS.PRODUCT_ID.id, ORDERS.CREATED_AT.id],
    };
    const linkedTableId = "card__456";
    const linkedTable = {
      id: linkedTableId,
      db_id: SAMPLE_DATABASE.id,
      fields: [PRODUCTS.ID.id, PRODUCTS.PRICE.id, PRODUCTS.CREATED_AT.id],
    };

    return state
      .assocIn(["entities", "tables", tableId], tableWithWithoutNumericFields)
      .assocIn(["entities", "tables", linkedTableId], linkedTable);
  });

  return new Question(questionDetail, metadata).query();
}

const getShortName = aggregation => aggregation.short;
// have to map Field entities as they contain circular references Field - Table - Metadata - Field
const processAggregationOperator = operator =>
  operator && {
    ...operator,
    fields: operator.fields.map(({ id, name, table_id }) => ({
      id,
      name,
      table_id,
    })),
  };

const query = makeQuery({});

describe("StructuredQuery behavioral tests", () => {
  it("is able to filter by field which is already used for the query breakout", () => {
    const breakoutDimensionOptions = query.breakoutOptions().dimensions;
    const breakoutDimension = breakoutDimensionOptions.find(
      d => d.field().id === ORDERS.TOTAL.id,
    );

    expect(breakoutDimension).toBeDefined();

    const queryWithBreakout = query.breakout(breakoutDimension.mbql());

    const filterDimensionOptions =
      queryWithBreakout.filterDimensionOptions().dimensions;
    const filterDimension = filterDimensionOptions.find(
      d => d.field().id === ORDERS.TOTAL.id,
    );

    expect(filterDimension).toBeDefined();
  });
});

describe("StructuredQuery", () => {
  describe("DB METADATA METHODS", () => {
    describe("tables", () => {
      it("Tables should return multiple tables", () => {
        expect(Array.isArray(query.tables())).toBe(true);
      });
      it("Tables should return a table map that includes fields", () => {
        expect(Array.isArray(query.tables()[0].fields)).toBe(true);
      });
    });
    describe("table", () => {
      it("Return the table wrapper object for the query", () => {
        expect(query.table()).toBe(ORDERS);
      });
    });
    describe("databaseId", () => {
      it("returns the Database ID of the wrapped query", () => {
        expect(query.databaseId()).toBe(SAMPLE_DATABASE.id);
      });
    });
    describe("database", () => {
      it("returns a dictionary with the underlying database of the wrapped query", () => {
        expect(query.database().id).toBe(SAMPLE_DATABASE.id);
      });
    });
    describe("engine", () => {
      it("identifies the engine of a query", () => {
        // This is a magic constant and we should probably pull this up into an enum
        expect(query.engine()).toBe("h2");
      });
    });
    describe("dependentMetadata", () => {
      it("should include db schemas and source table with foreignTables = true", () => {
        expect(query.dependentMetadata()).toEqual([
          { type: "schema", id: SAMPLE_DATABASE.id },
          { type: "table", id: ORDERS.id, foreignTables: true },
        ]);
      });

      it("should include db schemas and source table for nested queries with foreignTables = true", () => {
        expect(query.nest().dependentMetadata()).toEqual([
          { type: "schema", id: SAMPLE_DATABASE.id },
          { type: "table", id: ORDERS.id, foreignTables: true },
        ]);
      });

      it("should include db schemas and joined tables with foreignTables = false", () => {
        expect(
          query
            .join({
              alias: "x",
              "source-table": PRODUCTS.id,
            })
            .dependentMetadata(),
        ).toEqual([
          { type: "schema", id: SAMPLE_DATABASE.id },
          { type: "table", id: ORDERS.id, foreignTables: true },
          { type: "table", id: PRODUCTS.id, foreignTables: false },
        ]);
      });

      describe("when the query is missing a database", () => {
        it("should not include db schemas in dependent  metadata", () => {
          const dependentMetadata = query
            .setDatabaseId(null)
            .dependentMetadata();

          expect(dependentMetadata.some(({ type }) => type === "schema")).toBe(
            false,
          );
        });
      });
    });
  });

  describe("SIMPLE QUERY MANIPULATION METHODS", () => {
    describe("reset", () => {
      it("Expect a reset query to not have a selected database", () => {
        expect(query.reset().database()).toBe(null);
      });
      it("Expect a reset query to not be runnable", () => {
        expect(query.reset().canRun()).toBe(false);
      });
    });
    describe("query", () => {
      it("returns the wrapper for the query dictionary", () => {
        expect(query.query()["source-table"]).toBe(ORDERS.id);
      });
    });
    describe("setDatabase", () => {
      it("allows you to set a new database", () => {
        expect(query.setDatabase(ANOTHER_DATABASE).database().id).toBe(
          ANOTHER_DATABASE.id,
        );
      });
    });
    describe("setTable", () => {
      it("allows you to set a new table", () => {
        expect(query.setTable(PRODUCTS).tableId()).toBe(PRODUCTS.id);
      });

      it("retains the correct database id when setting a new table", () => {
        expect(query.setTable(PRODUCTS).table().database.id).toBe(
          SAMPLE_DATABASE.id,
        );
      });
    });
    describe("tableId", () => {
      it("Return the right table id", () => {
        expect(query.tableId()).toBe(ORDERS.id);
      });
    });
  });

  describe("QUERY STATUS METHODS", () => {
    describe("canRun", () => {
      it("runs a valid query", () => {
        expect(query.canRun()).toBe(true);
      });
    });
    describe("isEditable", () => {
      it("A valid query should be editable", () => {
        expect(query.isEditable()).toBe(true);
      });

      it("should be not editable when database object is missing", () => {
        const q = makeQuery();
        q.database = () => null;
        expect(q.isEditable()).toBe(false);
      });
    });
    describe("isEmpty", () => {
      it("tells that a non-empty query is not empty", () => {
        expect(query.isEmpty()).toBe(false);
      });
    });
  });

  describe("AGGREGATION METHODS", () => {
    describe("aggregations", () => {
      it("should return an empty list for an empty query", () => {
        expect(query.aggregations().length).toBe(0);
      });
      it("should return a list of one item after adding an aggregation", () => {
        expect(query.aggregate(["count"]).aggregations().length).toBe(1);
      });
      it("should return an actual count aggregation after trying to add it", () => {
        expect(query.aggregate(["count"]).aggregations()[0][0]).toEqual(
          "count",
        );
      });
    });

    describe("canRemoveAggregation", () => {
      it("returns false if there are no aggregations", () => {
        expect(query.canRemoveAggregation()).toBe(false);
      });
      it("returns false for a single aggregation", () => {
        expect(query.aggregate(["count"]).canRemoveAggregation()).toBe(false);
      });
      it("returns true for two aggregations", () => {
        expect(
          query
            .aggregate(["count"])
            .aggregate(["sum", ["field", ORDERS.TOTAL.id, null]])
            .canRemoveAggregation(),
        ).toBe(true);
      });
    });

    describe("isBareRows", () => {
      it("is true for an empty query", () => {
        expect(query.isBareRows()).toBe(true);
      });
      it("is false for a count aggregation", () => {
        expect(query.aggregate(["count"]).isBareRows()).toBe(false);
      });
    });

    describe("aggregation name", () => {
      it("returns a saved metric's name", () => {
        expect(
          makeQueryWithAggregation(["metric", MAIN_METRIC_ID])
            .aggregations()[0]
            .displayName(),
        ).toBe("Total Order Value");
      });
      it("returns a standard aggregation name", () => {
        expect(
          makeQueryWithAggregation(["count"]).aggregations()[0].displayName(),
        ).toBe("Count");
      });
      it("returns a standard aggregation name with field", () => {
        expect(
          makeQueryWithAggregation(["sum", ["field", ORDERS.TOTAL.id, null]])
            .aggregations()[0]
            .displayName(),
        ).toBe("Sum of Total");
      });
      it("returns a standard aggregation name with fk field", () => {
        expect(
          makeQueryWithAggregation([
            "sum",
            [
              "field",
              PRODUCTS.TITLE.id,
              { "source-field": ORDERS.PRODUCT_ID.id },
            ],
          ])
            .aggregations()[0]
            .displayName(),
        ).toBe("Sum of Product → Title");
      });
      it("returns a custom expression description", () => {
        expect(
          makeQueryWithAggregation([
            "+",
            1,
            ["sum", ["field", ORDERS.TOTAL.id, null]],
          ])
            .aggregations()[0]
            .displayName(),
        ).toBe("1 + Sum(Total)");
      });
      it("returns a named expression name", () => {
        expect(
          makeQueryWithAggregation([
            "aggregation-options",
            ["sum", ["field", ORDERS.TOTAL.id, null]],
            { "display-name": "Named" },
          ])
            .aggregations()[0]
            .displayName(),
        ).toBe("Named");
      });
    });

    describe("addAggregation", () => {
      it("adds an aggregation", () => {
        expect(query.aggregate(["count"]).query()).toEqual({
          "source-table": ORDERS.id,
          aggregation: [["count"]],
        });
      });
    });

    describe("aggregationOperators", () => {
      it("has the same aggregation operators when query have no custom fields", () => {
        // NOTE: Equality check between .aggregationOperators() results leads to an OOM error due to circular references
        expect(
          query.aggregationOperators().map(processAggregationOperator),
        ).toEqual(
          query.table().aggregationOperators().map(processAggregationOperator),
        );

        expect(query.aggregationOperators().map(getShortName)).toEqual([
          "rows",
          "count",
          "sum",
          "avg",
          "median",
          "distinct",
          "cum-sum",
          "cum-count",
          "stddev",
          "min",
          "max",
        ]);
      });

      describe("query without numeric fields", () => {
        it("shows aggregation operators only for available fields", () => {
          const queryWithoutNumericFields = makeQueryWithoutNumericFields();

          const queryOperators = queryWithoutNumericFields
            .aggregationOperators()
            .map(processAggregationOperator);
          const tableOperators = queryWithoutNumericFields
            .table()
            .aggregationOperators()
            .map(processAggregationOperator);

          // NOTE: Equality check between .aggregationOperators() results leads to an OOM error due to circular references
          expect(queryOperators).toEqual(tableOperators);
          expect(
            queryWithoutNumericFields.aggregationOperators().map(getShortName),
          ).toEqual(["rows", "count", "distinct", "cum-count", "min", "max"]);
        });

        it('shows "avg" aggregation when having a numeric custom field', () => {
          const query = makeQueryWithoutNumericFields().addExpression(
            "custom_numeric_field",
            // Expression: case([ID] = 1, 11, 99)
            ["case", [["=", ORDERS.ID, 1], 11], { default: 99 }],
          );

          expect(
            query.aggregationOperators().map(processAggregationOperator),
          ).not.toEqual(
            query
              .table()
              .aggregationOperators()
              .map(processAggregationOperator),
          );
          expect(query.aggregationOperators().map(getShortName)).toEqual([
            "rows",
            "count",
            "sum",
            "avg",
            "median",
            "distinct",
            "cum-sum",
            "cum-count",
            "stddev",
            "min",
            "max",
          ]);
        });

        it("shows aggregation operators for linked tables fields", () => {
          const queryWithoutNumericFields = makeQueryWithLinkedTable();
          const operators = queryWithoutNumericFields.aggregationOperators();

          expect(operators.map(getShortName)).toEqual([
            "rows",
            "count",
            "sum",
            "avg",
            "median",
            "distinct",
            "cum-sum",
            "cum-count",
            "stddev",
            "min",
            "max",
          ]);
        });
      });
    });

    describe("aggregationOperator", () => {
      it("has the same aggregation operator when query have no custom fields", () => {
        const short = "avg";

        expect(
          processAggregationOperator(query.aggregationOperator(short)),
        ).toEqual(
          processAggregationOperator(query.table().aggregationOperator(short)),
        );
      });

      it("can not find `avg` aggregation with table without numeric fields", () => {
        const query = makeQueryWithoutNumericFields();
        const short = "avg";

        expect(query.aggregationOperator(short)).toBeUndefined();
      });

      it("can find `avg` aggregation when having a numeric custom field on table without numeric fields", () => {
        const query = makeQueryWithoutNumericFields().addExpression(
          "custom_numeric_field",
          // Expression: case([ID] = 1, 11, 99)
          ["case", [["=", ORDERS.ID, 1], 11], { default: 99 }],
        );
        const short = "avg";

        expect(query.aggregationOperator(short)).not.toBeUndefined();
      });
    });
  });

  // BREAKOUTS:
  describe("BREAKOUT METHODS", () => {
    describe("breakoutOptions", () => {
      it("returns the correct count of dimensions", () => {
        expect(query.breakoutOptions().all().length).toBe(28);
      });

      it("excludes the already used breakouts", () => {
        const queryWithBreakout = query.breakout([
          "field",
          ORDERS.TOTAL.id,
          null,
        ]);
        expect(queryWithBreakout.breakoutOptions().all().length).toBe(27);
      });

      it("excludes the already used fk breakouts", () => {
        const queryWithBreakout = query.breakout(
          ORDERS.PRODUCT_ID.foreign(PRODUCTS.CATEGORY),
        );
        expect(queryWithBreakout.breakoutOptions().all().length).toBe(27);
      });

      it("includes an explicitly provided breakout although it has already been used", () => {
        const breakout = ["field", ORDERS.TOTAL.id, null];
        const queryWithBreakout = query.breakout(breakout);
        expect(queryWithBreakout.breakoutOptions().all().length).toBe(27);
        expect(queryWithBreakout.breakoutOptions(breakout).all().length).toBe(
          28,
        );
      });
    });
    describe("hasValidBreakout", () => {
      it("should return false if there are no breakouts", () => {
        expect(query.hasValidBreakout()).toBe(false);
      });
      it("should return true if there is at least one breakout", () => {
        expect(query.breakout(ORDERS.PRODUCT_ID).hasValidBreakout()).toBe(true);
      });
    });

    it("excludes breakout that has the same base dimension as what is already used", () => {
      const breakout = [
        "field",
        ORDERS.CREATED_AT.id,
        { "temporal-unit": "month" },
      ];
      const queryWithBreakout = query.breakout(breakout);
      const createdAtBreakoutDimension = queryWithBreakout
        .breakouts()
        .map(breakout => breakout.dimension());

      //Ensure dimension added is not present in breakout options
      expect(queryWithBreakout.breakoutOptions().all()).toEqual(
        expect.not.arrayContaining(createdAtBreakoutDimension),
      );

      expect(
        queryWithBreakout
          .breakoutOptions()
          .all()
          .some(dimension => dimension.field().id === ORDERS.CREATED_AT.id),
      ).toBe(false);

      //Ensure that only 1 breakout option was removed after adding our breakout
      expect(queryWithBreakout.breakoutOptions().all().length).toBe(
        query.breakoutOptions().all().length - 1,
      );
    });
  });

  // FILTERS:
  describe("FILTER METHODS", () => {
    describe("segments", () => {
      it("should list any applied segments that are currently active filters", () => {
        const queryWithSegmentFilter = query.filter(["segment", 1]);
        // expect there to be segments
        expect(queryWithSegmentFilter.segments().length).toBe(1);
        // and they should actually be segments
        expect(queryWithSegmentFilter.segments()[0]).toBeInstanceOf(Segment);
      });
    });
  });

  describe("SORT METHODS", () => {
    describe("sorts", () => {
      it("return an empty array", () => {
        expect(query.sorts()).toEqual([]);
      });
      it("return an array with the sort clause", () => {
        expect(
          makeQuery({
            "order-by": [["asc", ["field", ORDERS.TOTAL.id, null]]],
          }).sorts(),
        ).toEqual([["asc", ["field", ORDERS.TOTAL.id, null]]]);
      });
    });

    describe("sortOptions", () => {
      it("returns the correct count of dimensions", () => {
        expect(query.sortOptions().dimensions.length).toBe(7);
      });

      it("excludes the already used sorts", () => {
        const queryWithBreakout = query.sort([
          "asc",
          ["field", ORDERS.TOTAL.id, null],
        ]);
        expect(queryWithBreakout.sortOptions().dimensions.length).toBe(6);
      });

      it("includes an explicitly provided sort although it has already been used", () => {
        const sort = ["asc", ["field", ORDERS.TOTAL.id, null]];
        const queryWithBreakout = query.sort(sort);
        expect(queryWithBreakout.sortOptions().dimensions.length).toBe(6);
        expect(queryWithBreakout.sortOptions(sort).dimensions.length).toBe(7);
      });
    });
  });

  describe("DIMENSION METHODS", () => {
    describe("fieldOptions", () => {
      it("includes the correct number of dimensions", () => {
        // Should just include the non-fk keys from the current table
        expect(query.fieldOptions().dimensions.length).toBe(7);
      });

      it("returns correct count of foreign keys", () => {
        expect(query.fieldOptions().fks.length).toBe(2);
      });
      it("returns a correct count of fields", () => {
        expect(query.fieldOptions().count).toBe(28);
      });
    });
  });

  describe("DATASET QUERY METHODS", () => {
    describe("setDatasetQuery", () => {
      it("replaces the previous dataset query with the provided one", () => {
        const newDatasetQuery = makeDatasetQuery({
          "source-table": ORDERS.id,
          aggregation: [["count"]],
        });

        expect(query.setDatasetQuery(newDatasetQuery).datasetQuery()).toBe(
          newDatasetQuery,
        );
      });
    });
  });
});
