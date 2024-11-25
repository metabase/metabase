import { createMockMetadata } from "__support__/metadata";
import StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import {
  createMockDatabase,
  createMockSegment,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

const ANOTHER_DB_ID = SAMPLE_DB_ID + 1;

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase(),
    createMockDatabase({ id: ANOTHER_DB_ID }),
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
