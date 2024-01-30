import { createMockMetadata } from "__support__/metadata";
import type { Field, Table } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getDefaultDisplay } from "./display";
import { createQuery, createQueryWithClauses } from "./test-helpers";

const ACCOUNTS_ID = 4;

const ACCOUNTS = {
  ID: 48,
  COUNTRY: 56,
};

const createAccountsTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: ACCOUNTS_ID,
    db_id: SAMPLE_DB_ID,
    name: "ACCOUNTS",
    display_name: "Accounts",
    schema: "PUBLIC",
    fields: [createAccountsIdField(), createAccountsCountryField()],
    ...opts,
  });

const createAccountsIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ACCOUNTS.ID,
    table_id: ACCOUNTS_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    semantic_type: "type/PK",
    fingerprint: null,
    ...opts,
  });

const createAccountsCountryField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ACCOUNTS.COUNTRY,
    table_id: ACCOUNTS_ID,
    name: "COUNTRY",
    display_name: "Country",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Country",
    fingerprint: null,
    ...opts,
  });

const SAMPLE_DATABASE = createSampleDatabase({
  tables: [
    createAccountsTable(),
    createOrdersTable(),
    createPeopleTable(),
    createProductsTable(),
    createReviewsTable(),
  ],
});

const SAMPLE_METADATA = createMockMetadata({ databases: [SAMPLE_DATABASE] });

describe("getDefaultDisplay", () => {
  describe("native queries", () => {
    it("returns 'table' display for native queries", () => {
      const query = createQuery({
        metadata: SAMPLE_METADATA,
        query: {
          database: SAMPLE_DATABASE.id,
          type: "native",
          native: {
            query: "SELECT * FROM ORDERS",
          },
        },
      });

      expect(getDefaultDisplay(query)).toEqual({ display: "table" });
    });
  });

  describe("structured queries", () => {
    it("returns 'table' display for queries with no aggregations and no breakouts", () => {
      const query = createQuery();

      expect(getDefaultDisplay(query)).toEqual({ display: "table" });
    });

    it("returns 'scalar' display for queries with 1 aggregation and no breakouts", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
      });

      expect(getDefaultDisplay(query)).toEqual({ display: "scalar" });
    });

    it("returns 'map' display for queries with 1 aggregation and 1 breakout by state", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [{ columnName: "STATE", tableName: "PEOPLE" }],
      });

      expect(getDefaultDisplay(query)).toEqual({
        display: "map",
        settings: {
          "map.type": "region",
          "map.region": "us_states",
        },
      });
    });

    it("returns 'map' display for queries with 1 aggregation and 1 breakout by country", () => {
      const query = createQueryWithClauses({
        query: createQuery({
          metadata: SAMPLE_METADATA,
          query: {
            database: SAMPLE_DATABASE.id,
            type: "query",
            query: {
              "source-table": ACCOUNTS_ID,
            },
          },
        }),
        aggregations: [{ operatorName: "count" }],
        breakouts: [{ columnName: "COUNTRY", tableName: "ACCOUNTS" }],
      });

      expect(getDefaultDisplay(query)).toEqual({
        display: "map",
        settings: {
          "map.type": "region",
          "map.region": "world_countries",
        },
      });
    });

    it("returns 'bar' display for queries with aggregations and 1 breakout by date with temporal bucketing", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [
          {
            columnName: "CREATED_AT",
            tableName: "ORDERS",
            temporalBucketName: "Day of month",
          },
        ],
      });

      expect(getDefaultDisplay(query)).toEqual({ display: "bar" });
    });

    it("returns 'line' display for queries with aggregations and 1 breakout by date without temporal bucketing", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [{ columnName: "CREATED_AT", tableName: "ORDERS" }],
      });

      expect(getDefaultDisplay(query)).toEqual({ display: "line" });
    });

    it("returns 'bar' display for queries with aggregations and 1 breakout with binning", () => {
      const query = createQueryWithClauses({
        query: createQueryWithClauses({
          aggregations: [{ operatorName: "count" }],
        }),
        breakouts: [
          {
            columnName: "TOTAL",
            tableName: "ORDERS",
            binningStrategyName: "10 bins",
          },
        ],
      });

      expect(getDefaultDisplay(query)).toEqual({ display: "bar" });
    });

    it("returns 'table' display for queries with aggregations and 1 breakout without binning", () => {
      const query = createQueryWithClauses({
        query: createQueryWithClauses({
          aggregations: [{ operatorName: "count" }],
        }),
        breakouts: [{ columnName: "TOTAL", tableName: "ORDERS" }],
      });

      expect(getDefaultDisplay(query)).toEqual({ display: "table" });
    });

    it("returns 'line' display for queries with 1 aggregation and 2 breakouts, at least 1 of which is date", () => {
      const query = createQueryWithClauses({
        query: createQueryWithClauses({
          aggregations: [{ operatorName: "count" }],
        }),
        breakouts: [
          { columnName: "CREATED_AT", tableName: "ORDERS" },
          { columnName: "TOTAL", tableName: "ORDERS" },
        ],
      });

      expect(getDefaultDisplay(query)).toEqual({ display: "line" });
    });

    it("returns 'map' display for queries with 1 aggregation and 2 breakouts by coordinates", () => {
      const query = createQueryWithClauses({
        query: createQueryWithClauses({
          aggregations: [{ operatorName: "count" }],
        }),
        breakouts: [
          { columnName: "LATITUDE", tableName: "PEOPLE" },
          { columnName: "LONGITUDE", tableName: "PEOPLE" },
        ],
      });

      expect(getDefaultDisplay(query)).toEqual({
        display: "map",
        settings: {
          "map.type": "grid",
        },
      });
    });

    it("returns 'table' display by default", () => {
      const query = createQueryWithClauses({
        query: createQueryWithClauses({
          aggregations: [{ operatorName: "count" }, { operatorName: "avg" }],
        }),
        breakouts: [
          { columnName: "LATITUDE", tableName: "PEOPLE" },
          { columnName: "LONGITUDE", tableName: "PEOPLE" },
        ],
      });

      expect(getDefaultDisplay(query)).toEqual({ display: "table" });
    });
  });
});
