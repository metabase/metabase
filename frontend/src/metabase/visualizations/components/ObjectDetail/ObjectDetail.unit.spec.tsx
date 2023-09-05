import fetchMock from "fetch-mock";
import {
  getBrokenUpTextMatcher,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { testDataset } from "__support__/testDataset";
import {
  setupActionsEndpoints,
  setupDatabasesEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createProductsTable,
  createReviewsTable,
} from "metabase-types/api/mocks/presets";
import { createMockEntitiesState } from "__support__/store";
import type { Field } from "metabase-types/api";

import ObjectDetail from "./ObjectDetail";

const PRODUCTS_TABLE = createProductsTable();
const ORDERS_TABLE = createOrdersTable();
const REVIEWS_TABLE = createReviewsTable();

function setup() {
  setupDatabasesEndpoints([]);
  setupActionsEndpoints([]);
  const productsId = findField(PRODUCTS_TABLE.fields, "ID");
  const ordersProductId = findField(ORDERS_TABLE.fields, "PRODUCT_ID");
  const reviewsProductId = findField(REVIEWS_TABLE.fields, "PRODUCT_ID");
  setupTableEndpoints(PRODUCTS_TABLE, [
    {
      origin: ordersProductId,
      origin_id: ordersProductId.id as number,
      destination: productsId,
      destination_id: productsId.id as number,
      relationship: "Mt1",
    },
    {
      origin: reviewsProductId,
      origin_id: reviewsProductId.id as number,
      destination: productsId,
      destination_id: productsId.id as number,
      relationship: "Mt1",
    },
  ]);
  setupForeignKeyCountQueryEndpoints();

  const ROW_ID_INDEX = 0;
  const state = createMockState({
    entities: createMockEntitiesState({
      tables: [PRODUCTS_TABLE, ORDERS_TABLE, REVIEWS_TABLE],
    }),
    qb: createMockQueryBuilderState({
      card: createMockCard({
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": PRODUCTS_ID,
          },
        },
      }),
      zoomedRowObjectId: testDataset.rows[0][ROW_ID_INDEX] as string,
      queryResults: [
        createMockDataset({
          data: testDataset,
        }),
      ],
    }),
  });
  renderWithProviders(
    <ObjectDetail
      data={testDataset}
      settings={{}}
      isObjectDetail
      onVisualizationClick={jest.fn()}
      visualizationIsClickable={jest.fn()}
    />,
    {
      storeInitialState: state,
    },
  );
}

function setupForeignKeyCountQueryEndpoints() {
  // XXX: I've tried to use the same function matcher but `request.body` was a promise. I'm not sure why they aren't the same 🤔
  fetchMock.post(
    {
      url: "path:/api/dataset",
      matchPartialBody: true,
      body: {
        query: { "source-table": ORDERS_TABLE.id },
      },
    },
    createMockDataset({
      status: "completed",
      data: {
        rows: [[93]],
      },
    }),
  );
  fetchMock.post(
    (url, request) => {
      return (
        url === "http://localhost/api/dataset" &&
        JSON.parse(request.body as string).query?.["source-table"] ===
          REVIEWS_TABLE.id
      );
    },
    createMockDataset({
      status: "completed",
      data: {
        rows: [[8]],
      },
    }),
  );
}

function findField(fields: Field[] | undefined, name: string): Field {
  return fields?.find(field => field.name === name) as Field;
}

describe("ObjectDetail", () => {
  it("should render", async () => {
    setup();

    expect(
      await screen.findByText(getBrokenUpTextMatcher("93Orders")),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(getBrokenUpTextMatcher("8Reviews")),
    ).toBeInTheDocument();
  });
});
