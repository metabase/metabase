import { createMockMetadata } from "__support__/metadata";
import type { Field, Table } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { defaultDisplay } from "./display";
import {
  createMetadataProvider,
  createTestNativeQuery,
  createTestQuery,
} from "./test-helpers";

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
  tables: [
    createProductsTable(),
    createReviewsTable(),
    createOrdersTable(),
    createPeopleTable(),
    createAccountsTable(),
  ],
});

const SAMPLE_METADATA = createMockMetadata({
  databases: [SAMPLE_DATABASE],
});

const SAMPLE_PROVIDER = createMetadataProvider({
  databaseId: SAMPLE_DATABASE.id,
  metadata: SAMPLE_METADATA,
});

describe("defaultDisplay", () => {
  it("returns 'table' display for native queries", () => {
    const query = createTestNativeQuery(
      SAMPLE_PROVIDER,
      SAMPLE_DATABASE.id,
      "SELECT * FROM ACCOUNTS",
    );
    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });

  it("returns 'table' display for queries with no aggregations and no breakouts", () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });

  it("returns 'scalar' display for queries with 1 aggregation and no breakouts", () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "scalar" });
  });

  it("returns 'map' display for queries with 1 aggregation and 1 breakout by state", () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [{ name: "STATE" }],
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
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ACCOUNTS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [
            {
              name: "COUNTRY",
            },
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
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [
            {
              name: "CREATED_AT",
              groupName: "Orders",
              unit: "day-of-month",
            },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'line' display for queries with aggregations and 1 breakout by date without temporal bucketing", () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [
            {
              name: "CREATED_AT",
              groupName: "Orders",
            },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "line" });
  });

  it("returns 'bar' display for queries with aggregations and 1 breakout with binning", () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [
            {
              name: "TOTAL",
              groupName: "Orders",
              binningCount: 10,
            },
          ],
        },
      ],
    });
    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'table' display for queries with aggregations and 1 breakout without binning", () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [
            {
              name: "TOTAL",
              groupName: "Orders",
            },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });

  it("returns 'bar' display for queries with aggregations and 1 breakout by category", () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [
            {
              name: "CATEGORY",
              groupName: "Product",
            },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'line' display for queries with 1 aggregation and 2 breakouts, at least 1 of which is by date", () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [{ name: "CREATED_AT" }, { name: "TOTAL" }],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "line" });
  });

  it("returns 'map' display with 'grid' type for queries with 1 aggregation and 2 binned breakouts by coordinates", () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [
            {
              name: "LATITUDE",
              binningCount: "auto",
            },
            {
              name: "LONGITUDE",
              binningCount: "auto",
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
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [{ name: "LATITUDE" }, { name: "LONGITUDE" }],
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
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [
            {
              name: "LATITUDE",
              binningCount: "auto",
            },
            { name: "LONGITUDE" },
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
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
          ],
          breakouts: [
            { name: "CATEGORY", groupName: "Product" },
            { name: "VENDOR", groupName: "Product" },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "bar" });
  });

  it("returns 'table' display by default", () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          aggregations: [
            {
              name: "Count",
              value: { type: "operator", operator: "count", args: [] },
            },
            {
              name: "Cumulative Count",
              value: { type: "operator", operator: "cum-count", args: [] },
            },
          ],
          breakouts: [
            { name: "LATITUDE", groupName: "User" },
            { name: "LONGITUDE", groupName: "User" },
          ],
        },
      ],
    });

    expect(defaultDisplay(query)).toEqual({ display: "table" });
  });
});
