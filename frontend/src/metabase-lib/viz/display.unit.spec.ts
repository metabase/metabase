import { createMockMetadata } from "__support__/metadata";
import type { Field, Table } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { createQuery, createQueryWithClauses } from "../test-helpers";

import { defaultDisplay } from "./display";

const ACCOUNTS_ID = 4;
const ACCOUNTS_COUNTRY_ID = 56;

const createAccountsTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: ACCOUNTS_ID,
    db_id: SAMPLE_DB_ID,
    name: "ACCOUNTS",
    display_name: "Accounts",
    schema: "PUBLIC",
    fields: [createAccountsCountryField()],
    ...opts,
  });

const createAccountsCountryField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ACCOUNTS_COUNTRY_ID,
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
  tables: [createAccountsTable()],
});

const SAMPLE_METADATA = createMockMetadata({ databases: [SAMPLE_DATABASE] });

describe("defaultDisplay", () => {
  it("returns 'table' display for native queries", () => {
    const query = createQuery({
      metadata: SAMPLE_METADATA,
      query: {
        database: SAMPLE_DATABASE.id,
        type: "native",
        native: {
          query: "SELECT * FROM ACCOUNTS",
        },
      },
    });

    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });

  it("returns 'table' display for queries with no aggregations and no breakouts", () => {
    const query = createQuery();

    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });

  it("returns 'scalar' display for queries with 1 aggregation and no breakouts", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
    });

    expect(defaultDisplay(query)).toEqual({ display: "scalar" });
  });

  it("returns 'map' display for queries with 1 aggregation and 1 breakout by state", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "STATE", tableName: "PEOPLE" }],
    });

    expect(defaultDisplay(query)).toEqual({
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

    expect(defaultDisplay(query)).toEqual({
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

    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'line' display for queries with aggregations and 1 breakout by date without temporal bucketing", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "CREATED_AT", tableName: "ORDERS" }],
    });

    expect(defaultDisplay(query)).toEqual({ display: "line" });
  });

  it("returns 'bar' display for queries with aggregations and 1 breakout with binning", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        {
          columnName: "TOTAL",
          tableName: "ORDERS",
          binningStrategyName: "10 bins",
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'table' display for queries with aggregations and 1 breakout without binning", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "TOTAL", tableName: "ORDERS" }],
    });

    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });

  it("returns 'bar' display for queries with aggregations and 1 breakout by category", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "CATEGORY", tableName: "PRODUCTS" }],
    });

    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'line' display for queries with 1 aggregation and 2 breakouts, at least 1 of which is by date", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        { columnName: "CREATED_AT", tableName: "ORDERS" },
        { columnName: "TOTAL", tableName: "ORDERS" },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "line" });
  });

  it("returns 'map' display with 'grid' type for queries with 1 aggregation and 2 binned breakouts by coordinates", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        {
          columnName: "LATITUDE",
          tableName: "PEOPLE",
          binningStrategyName: "Auto bin",
        },
        {
          columnName: "LONGITUDE",
          tableName: "PEOPLE",
          binningStrategyName: "Auto bin",
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({
      display: "map",
      settings: {
        "map.type": "grid",
      },
    });
  });

  it("returns 'map' display with 'pin' type for queries with 1 aggregation and 2 un-binned breakouts by coordinates", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        { columnName: "LATITUDE", tableName: "PEOPLE" },
        { columnName: "LONGITUDE", tableName: "PEOPLE" },
      ],
    });

    expect(defaultDisplay(query)).toEqual({
      display: "map",
      settings: {
        "map.type": "pin",
      },
    });
  });

  it("returns 'map' display with 'pin' type for queries with 1 aggregation and 2 breakouts by coordinates - 1 binned, 1 unbinned", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        {
          columnName: "LATITUDE",
          tableName: "PEOPLE",
          binningStrategyName: "Auto bin",
        },
        { columnName: "LONGITUDE", tableName: "PEOPLE" },
      ],
    });

    expect(defaultDisplay(query)).toEqual({
      display: "map",
      settings: {
        "map.type": "pin",
      },
    });
  });

  it("returns 'bar' display for queries with 1 aggregation and 2 breakouts by category", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        { columnName: "CATEGORY", tableName: "PRODUCTS" },
        { columnName: "VENDOR", tableName: "PRODUCTS" },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'table' display by default", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }, { operatorName: "cum-count" }],
      breakouts: [
        { columnName: "LATITUDE", tableName: "PEOPLE" },
        { columnName: "LONGITUDE", tableName: "PEOPLE" },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });
});
