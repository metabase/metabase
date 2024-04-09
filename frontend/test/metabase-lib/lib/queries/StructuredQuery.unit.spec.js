import { createMockMetadata } from "__support__/metadata";
import Question from "metabase-lib/v1/Question";
import Segment from "metabase-lib/v1/metadata/Segment";
import StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import {
  createMockDatabase,
  createMockMetric,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  createOrdersCreatedAtField,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersTable,
  createPeopleTable,
  createProductsCreatedAtField,
  createProductsIdField,
  createProductsPriceField,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

const ANOTHER_DB_ID = SAMPLE_DB_ID + 1;

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase(),
    createMockDatabase({ id: ANOTHER_DB_ID }),
  ],
  metrics: [
    createMockMetric({
      id: 1,
      table_id: ORDERS_ID,
      name: "Total Order Value",
      definition: {
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        "source-table": ORDERS_ID,
      },
    }),
  ],
  segments: [
    createMockSegment({
      id: 1,
      table_id: ORDERS_ID,
      name: "Expensive Things",
      definition: {
        filter: [">", ["field", ORDERS.TOTAL, null], 30],
        "source-table": ORDERS_ID,
      },
    }),
  ],
});

const ordersTable = metadata.table(ORDERS_ID);

function makeDatasetQuery(query = {}) {
  return {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": query["source-query"] ? undefined : ORDERS_ID,
      ...query,
    },
  };
}

function makeQuery(query) {
  return new StructuredQuery(ordersTable.question(), makeDatasetQuery(query));
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
      database: SAMPLE_DB_ID,
      query: {
        "source-table": virtualCardId,
      },
    },
  };

  const tableWithWithoutNumericFields = createMockTable({
    id: virtualCardId,
    db_id: SAMPLE_DB_ID,
    fields: [createOrdersIdField(), createOrdersCreatedAtField()],
  });

  const metadata = createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [
          createProductsTable(),
          createPeopleTable(),
          createReviewsTable(),
          tableWithWithoutNumericFields,
        ],
      }),
    ],
  });

  return new Question(questionDetail, metadata).legacyQuery({
    useStructuredQuery: true,
  });
}

// no numeric fields, but have linked table (FK) with a numeric field
function makeQueryWithLinkedTable() {
  const tableId = "card__123";
  const linkedTableId = "card__456";

  const questionDetail = {
    display: "table",
    visualization_settings: {},
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": tableId,
      },
    },
  };

  const tableWithWithoutNumericFields = createMockTable({
    id: tableId,
    db_id: SAMPLE_DB_ID,
    fields: [
      createOrdersIdField({ table_id: tableId }),
      createOrdersProductIdField({
        table_id: tableId,
        fk_target_field_id: `${linkedTableId}:${PRODUCTS.ID}`,
      }),
      createOrdersCreatedAtField({ table_id: tableId }),
    ],
  });

  const linkedTable = createMockTable({
    id: linkedTableId,
    db_id: SAMPLE_DB_ID,
    fields: [
      createProductsIdField({ table_id: linkedTableId }),
      createProductsPriceField({ table_id: linkedTableId }),
      createProductsCreatedAtField({ table_id: linkedTableId }),
    ],
  });

  const metadata = createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [
          createOrdersTable(),
          createProductsTable(),
          createPeopleTable(),
          tableWithWithoutNumericFields,
          linkedTable,
        ],
      }),
    ],
  });

  return new Question(questionDetail, metadata).legacyQuery({
    useStructuredQuery: true,
  });
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
        expect(query.table()).toBe(ordersTable);
      });
    });
    describe("_databaseId", () => {
      it("returns the Database ID of the wrapped query", () => {
        expect(query._databaseId()).toBe(SAMPLE_DB_ID);
      });
    });
    describe("_database", () => {
      it("returns a dictionary with the underlying database of the wrapped query", () => {
        expect(query._database().id).toBe(SAMPLE_DB_ID);
      });
    });
  });

  describe("SIMPLE QUERY MANIPULATION METHODS", () => {
    describe("query", () => {
      it("returns the wrapper for the query dictionary", () => {
        expect(
          query.legacyQuery({ useStructuredQuery: true })["source-table"],
        ).toBe(ORDERS_ID);
      });
    });
    describe("_sourceTableId", () => {
      it("Return the right table id", () => {
        expect(query._sourceTableId()).toBe(ORDERS_ID);
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
            .aggregate(["sum", ["field", ORDERS.TOTAL, null]])
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
          makeQueryWithAggregation(["metric", 1])
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
          makeQueryWithAggregation(["sum", ["field", ORDERS.TOTAL, null]])
            .aggregations()[0]
            .displayName(),
        ).toBe("Sum of Total");
      });
      it("returns a standard aggregation name with fk field", () => {
        expect(
          makeQueryWithAggregation([
            "sum",
            ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
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
            ["sum", ["field", ORDERS.TOTAL, null]],
          ])
            .aggregations()[0]
            .displayName(),
        ).toBe("1 + Sum(Total)");
      });
      it("returns a named expression name", () => {
        expect(
          makeQueryWithAggregation([
            "aggregation-options",
            ["sum", ["field", ORDERS.TOTAL, null]],
            { "display-name": "Named" },
          ])
            .aggregations()[0]
            .displayName(),
        ).toBe("Named");
      });
    });

    describe("addAggregation", () => {
      it("adds an aggregation", () => {
        expect(
          query.aggregate(["count"]).legacyQuery({ useStructuredQuery: true }),
        ).toEqual({
          "source-table": ORDERS_ID,
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

  describe("DIMENSION METHODS", () => {
    describe("fieldOptions", () => {
      it("includes the correct number of dimensions", () => {
        // Should just include the non-fk keys from the current table
        expect(query.fieldOptions().dimensions.length).toBe(9);
      });

      it("returns correct count of foreign keys", () => {
        expect(query.fieldOptions().fks.length).toBe(2);
      });
      it("returns a correct count of fields", () => {
        expect(query.fieldOptions().count).toBe(30);
      });
    });
  });

  describe("DATASET QUERY METHODS", () => {
    describe("setDatasetQuery", () => {
      it("replaces the previous dataset query with the provided one", () => {
        const newDatasetQuery = makeDatasetQuery({
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        });

        expect(query.setDatasetQuery(newDatasetQuery).datasetQuery()).toBe(
          newDatasetQuery,
        );
      });
    });
  });
});
