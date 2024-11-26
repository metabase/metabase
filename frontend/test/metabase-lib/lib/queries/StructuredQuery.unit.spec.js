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
});
