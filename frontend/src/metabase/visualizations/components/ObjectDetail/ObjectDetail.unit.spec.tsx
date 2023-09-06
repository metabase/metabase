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
const HIDDEN_ORDERS_TABLE = createOrdersTable({
  visibility_type: "hidden",
});
const REVIEWS_TABLE = createReviewsTable();

interface SetupOpts {
  hideOrdersTable?: boolean;
}

function setup({ hideOrdersTable = false }: SetupOpts = {}) {
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
      tables: [
        PRODUCTS_TABLE,
        hideOrdersTable ? HIDDEN_ORDERS_TABLE : ORDERS_TABLE,
        REVIEWS_TABLE,
      ],
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
  fetchMock.post(
    {
      name: "ordersCountQuery",
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
    {
      name: "reviewsCountQuery",
      url: "path:/api/dataset",
      matchPartialBody: true,
      body: {
        query: { "source-table": REVIEWS_TABLE.id },
      },
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
  it("should render foreign key count when no table is hidden", async () => {
    setup();

    expect(
      await screen.findByText(getBrokenUpTextMatcher("8Reviews")),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(getBrokenUpTextMatcher("93Orders")),
    ).toBeInTheDocument();
  });

  it("should render only foreign key count for foreign keys that their tables are not hidden (metabase#32654)", async () => {
    setup({ hideOrdersTable: true });

    expect(
      await screen.findByText(getBrokenUpTextMatcher("8Reviews")),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(getBrokenUpTextMatcher("93Orders")),
    ).not.toBeInTheDocument();
  });
});
