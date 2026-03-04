import fetchMock from "fetch-mock";

import {
  setupActionsEndpoints,
  setupDatabasesEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { testDataset } from "__support__/testDataset";
import {
  getBrokenUpTextMatcher,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import registerVisualizations from "metabase/visualizations/register";
import type { Field } from "metabase-types/api";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createProductsTable,
  createReviewsTable,
} from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { ObjectDetail } from "./ObjectDetail";

registerVisualizations();

const PRODUCTS_TABLE = createProductsTable();
const ORDERS_TABLE = createOrdersTable();
const HIDDEN_ORDERS_TABLE = createOrdersTable({
  visibility_type: "hidden",
});
const REVIEWS_TABLE = createReviewsTable();

const FK_RECORDS_COUNT = 93;

interface SetupOpts {
  hideOrdersTable?: boolean;
}

function setup({ hideOrdersTable = false }: SetupOpts = {}) {
  setupDatabasesEndpoints([]);
  setupActionsEndpoints([]);
  const productsId = checkNotNull(findField(PRODUCTS_TABLE.fields, "ID"));
  const ordersProductId = {
    ...checkNotNull(findField(ORDERS_TABLE.fields, "PRODUCT_ID")),
    table: ORDERS_TABLE,
  };
  const reviewsProductId = {
    ...checkNotNull(findField(REVIEWS_TABLE.fields, "PRODUCT_ID")),
    table: REVIEWS_TABLE,
  };
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
  fetchMock.post({
    name: "ordersCountQuery",
    url: "path:/api/dataset",
    response: createMockDataset({
      status: "completed",
      data: {
        rows: [[FK_RECORDS_COUNT]],
      },
    }),
  });
}

function findField(fields: Field[] | undefined, name: string) {
  return fields?.find((field) => field.name === name);
}

describe("ObjectDetail", () => {
  it("should render foreign key count when no table is hidden", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getAllByTestId("loading-indicator")).toHaveLength(2);
    });
    await waitForLoaderToBeRemoved();

    expect(
      await screen.findByText(
        getBrokenUpTextMatcher([FK_RECORDS_COUNT, "Reviews"].join("")),
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        getBrokenUpTextMatcher([FK_RECORDS_COUNT, "Orders"].join("")),
      ),
    ).toBeInTheDocument();
  });

  it("should render related objects count only for foreign keys referencing non-hidden tables (metabase#32654)", async () => {
    setup({ hideOrdersTable: true });

    await waitFor(() => {
      expect(screen.getAllByTestId("loading-indicator")).toHaveLength(2);
    });
    await waitForLoaderToBeRemoved();

    expect(
      await screen.findByText(
        getBrokenUpTextMatcher([FK_RECORDS_COUNT, "Reviews"].join("")),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText([FK_RECORDS_COUNT, "Orders"].join("")),
    ).not.toBeInTheDocument();
  });
});
