import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { createMockField, createMockTable } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "../test-helpers";

import { defaultDisplay } from "./display";

const DATABASE_ID = 1;
const ACCOUNTS_ID = 4;
const ACCOUNTS_COUNTRY_ID = 56;

const ACCOUNTS_COUNTRY = createMockField({
  id: ACCOUNTS_COUNTRY_ID,
  table_id: ACCOUNTS_ID,
  name: "COUNTRY",
  display_name: "Country",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: "type/Country",
  fingerprint: null,
});

const ACCOUNTS = createMockTable({
  id: ACCOUNTS_ID,
  db_id: DATABASE_ID,
  name: "ACCOUNTS",
  display_name: "Accounts",
  schema: "PUBLIC",
  fields: [ACCOUNTS_COUNTRY],
});

const DATABASE = createSampleDatabase({
  id: DATABASE_ID,
  tables: [ACCOUNTS],
});

const METADATA = createMockMetadata({ databases: [DATABASE] });
const PROVIDER = createMetadataProvider({
  databaseId: DATABASE.id,
  metadata: METADATA,
});

describe("defaultDisplay", () => {
  it("returns 'table' display for native queries", () => {
    const query = Lib.nativeQuery(
      DATABASE.id,
      PROVIDER,
      "SELECT * FROM ACCOUNTS",
    );

    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });

  it("returns 'table' display for queries with no aggregations and no breakouts", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });

  it("returns 'scalar' display for queries with 1 aggregation and no breakouts", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "scalar" });
  });

  it("returns 'map' display for queries with 1 aggregation and 1 breakout by state", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [{ type: "column", name: "STATE", sourceName: "PEOPLE" }],
        },
      ],
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
    const query = Lib.createTestQuery(PROVIDER, {
      stages: [
        {
          source: {
            type: "table",
            id: ACCOUNTS_ID,
          },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "COUNTRY", sourceName: "ACCOUNTS" },
          ],
        },
      ],
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
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [{ type: "operator", operator: "count" }],
          breakouts: [
            {
              type: "column",
              name: "CREATED_AT",
              sourceName: "ORDERS",
              unit: "day-of-month",
            },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'line' display for queries with aggregations and 1 breakout by date without temporal bucketing", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "CREATED_AT", sourceName: "ORDERS" },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "line" });
  });

  it("returns 'bar' display for queries with aggregations and 1 breakout with binning", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            {
              type: "column",
              name: "TOTAL",
              sourceName: "ORDERS",
              bins: 10,
            },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'table' display for queries with aggregations and 1 breakout without binning", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [{ type: "column", name: "TOTAL", sourceName: "ORDERS" }],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });

  it("returns 'bar' display for queries with aggregations and 1 breakout by category", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "CATEGORY", sourceName: "PRODUCTS" },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'line' display for queries with 1 aggregation and 2 breakouts, at least 1 of which is by date", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "CREATED_AT", sourceName: "ORDERS" },
            { type: "column", name: "TOTAL", sourceName: "ORDERS" },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "line" });
  });

  it("returns 'map' display with 'grid' type for queries with 1 aggregation and 2 binned breakouts by coordinates", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count" }],
          breakouts: [
            {
              type: "column",
              name: "LATITUDE",
              sourceName: "PEOPLE",
              binWidth: "auto",
            },
            {
              type: "column",
              name: "LONGITUDE",
              sourceName: "PEOPLE",
              binWidth: "auto",
            },
          ],
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
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "LATITUDE", sourceName: "PEOPLE" },
            { type: "column", name: "LONGITUDE", sourceName: "PEOPLE" },
          ],
        },
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
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            {
              type: "column",
              name: "LATITUDE",
              sourceName: "PEOPLE",
              // bins: "auto",
            },
            { type: "column", name: "LONGITUDE", sourceName: "PEOPLE" },
          ],
        },
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
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "CATEGORY", sourceName: "PRODUCTS" },
            { type: "column", name: "VENDOR", sourceName: "PRODUCTS" },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'table' display by default", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            { type: "operator", operator: "count", args: [] },
            { type: "operator", operator: "cum-count", args: [] },
          ],
          breakouts: [
            { type: "column", name: "LATITUDE", sourceName: "PEOPLE" },
            { type: "column", name: "LONGITUDE", sourceName: "PEOPLE" },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });
});
