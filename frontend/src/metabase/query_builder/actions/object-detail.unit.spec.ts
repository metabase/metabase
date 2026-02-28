import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import type { FieldId } from "metabase-types/api";
import { createMockForeignKey } from "metabase-types/api/mocks";
import { createMockColumn } from "metabase-types/api/mocks/dataset";
import {
  ORDERS,
  PRODUCTS,
  createOrdersProductIdField,
  createOrdersTable,
  createProductsIdField,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { createMockQueryBuilderState } from "metabase-types/store/mocks/qb";

import { loadObjectDetailFKReferences } from "./object-detail";

const PRODUCTS_TABLE = createProductsTable();
const ORDERS_TABLE = createOrdersTable();

const COUNT_COLUMN = createMockColumn({
  id: 1,
  display_name: "Count",
  name: "count",
  base_type: "type/Integer",
});

const FK = createMockForeignKey({
  origin: createOrdersProductIdField({
    table: ORDERS_TABLE,
  }),
  origin_id: ORDERS.PRODUCT_ID,
  destination: createProductsIdField({
    table: PRODUCTS_TABLE,
  }),
  destination_id: PRODUCTS.ID,
});

describe("loadObjectDetailFKReferences", () => {
  beforeEach(() => {
    fetchMock.reset();
  });

  const createTestState = () => {
    const card = {
      id: 1,
      dataset_query: {
        type: "query",
        database: 1,
        query: {
          "source-table": PRODUCTS_TABLE.id,
        },
      },
    };

    return createMockState({
      entities: createMockEntitiesState({
        databases: [
          createSampleDatabase({
            tables: [
              createProductsTable({
                fks: [FK],
              }),
              ORDERS_TABLE,
            ],
          }),
        ],
      }),
      qb: createMockQueryBuilderState({
        card,
        queryResults: [
          {
            json_query: card.dataset_query,
          },
        ],
      }),
    });
  };

  it("should handle empty rows array from count aggregation (metabase#62156)", async () => {
    const state = createTestState();
    const dispatch = jest.fn();
    const getState = () => state;

    // Mock the API response with an empty rows array
    // This simulates the behavior seen with MongoDB and other databases
    setupCardDataset({
      status: "completed",
      data: {
        rows: [], // Empty rows array
        cols: [COUNT_COLUMN],
      },
    });

    const action = loadObjectDetailFKReferences({ objectId: 123 });
    const result = await action(dispatch, getState);

    // The function should return FK references with value 0 instead of crashing
    expect(result).toBeDefined();
    expect(result).toHaveProperty(ORDERS.PRODUCT_ID);
    expect(result?.[ORDERS.PRODUCT_ID as FieldId]).toEqual({
      status: 1,
      value: 0, // Should default to 0 when rows array is empty
    });
  });

  it("should handle normal count results with data", async () => {
    const state = createTestState();
    const dispatch = jest.fn();
    const getState = () => state;

    // Mock the API response with a normal count result
    setupCardDataset({
      status: "completed",
      data: {
        rows: [[42]], // Normal count result
        cols: [COUNT_COLUMN],
      },
    });

    const action = loadObjectDetailFKReferences({ objectId: 123 });
    const result = await action(dispatch, getState);

    expect(result).toBeDefined();
    expect(result).toHaveProperty(ORDERS.PRODUCT_ID);
    expect(result?.[ORDERS.PRODUCT_ID as FieldId]).toEqual({
      status: 1,
      value: 42,
    });
  });

  it("should handle zero count results", async () => {
    const state = createTestState();
    const dispatch = jest.fn();
    const getState = () => state;

    // Mock the API response with a zero count
    setupCardDataset({
      status: "completed",
      data: {
        rows: [[0]], // Zero count
        cols: [COUNT_COLUMN],
      },
    });

    const action = loadObjectDetailFKReferences({ objectId: 123 });
    const result = await action(dispatch, getState);

    expect(result).toBeDefined();
    expect(result).toHaveProperty(ORDERS.PRODUCT_ID);
    expect(result?.[ORDERS.PRODUCT_ID as FieldId]).toEqual({
      status: 1,
      value: 0,
    });
  });

  it("should handle failed queries with Unknown value", async () => {
    const state = createTestState();
    const dispatch = jest.fn();
    const getState = () => state;

    // Mock a failed query response
    setupCardDataset({
      status: "failed",
      data: {
        rows: [],
        cols: [COUNT_COLUMN],
      },
    });

    const action = loadObjectDetailFKReferences({ objectId: 123 });
    const result = await action(dispatch, getState);

    expect(result).toBeDefined();
    expect(result).toHaveProperty(ORDERS.PRODUCT_ID);
    expect(result?.[ORDERS.PRODUCT_ID as FieldId]).toEqual({
      status: 1,
      value: "Unknown",
    });
  });
});
