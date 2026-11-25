import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionsEndpoints,
  setupDatabasesEndpoints,
  setupExecuteActionEndpoint,
  setupTableEndpoints,
} from "__support__/server-mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { testDataset } from "__support__/testDataset";
import {
  getBrokenUpTextMatcher,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { DatasetData, Field, WritebackAction } from "metabase-types/api";
import {
  createMockActionParameter,
  createMockCard,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersDiscountDatasetColumn,
  createOrdersIdDatasetColumn,
  createOrdersTable,
  createProductsTable,
  createReviewsTable,
} from "metabase-types/api/mocks/presets";

import { ObjectDetailSidesheet } from "./ObjectDetailSidesheet";

const MODEL_ID = 42;
let mockIsModel = false;

const mockRunQuestionQuery = jest.fn(() => ({
  type: "test/RUN_QUESTION_QUERY",
}));
jest.mock("../actions", () => ({
  ...jest.requireActual("../actions"),
  runQuestionQuery: () => mockRunQuestionQuery(),
}));
// A model in the query builder has the model card as its source card.
jest.mock("../store/selectors", () => {
  const actual = jest.requireActual("../store/selectors");
  return {
    ...actual,
    getSourceCardId: (state: unknown) =>
      mockIsModel ? MODEL_ID : actual.getSourceCardId(state),
  };
});

registerVisualizations();

const DELETE_ACTION = createMockImplicitQueryAction({
  id: 1,
  database_id: SAMPLE_DB_ID,
  model_id: MODEL_ID,
  kind: "row/delete",
  name: "Delete",
  parameters: [
    createMockActionParameter({
      id: "id",
      "display-name": "ID",
      type: "type/Integer",
    }),
  ],
});

const PRODUCTS_TABLE = createProductsTable();
const ORDERS_TABLE = createOrdersTable();
const HIDDEN_ORDERS_TABLE = createOrdersTable({
  visibility_type: "hidden",
});
const REVIEWS_TABLE = createReviewsTable();

const FK_RECORDS_COUNT = 93;

interface SetupOpts {
  hideOrdersTable?: boolean;
  isModel?: boolean;
  actions?: WritebackAction[];
  ordersData?: DatasetData;
}

function setup({
  hideOrdersTable = false,
  isModel = false,
  actions = [],
  ordersData,
}: SetupOpts = {}) {
  mockIsModel = isModel;
  setupDatabasesEndpoints(
    isModel
      ? [
          createMockDatabase({
            id: SAMPLE_DB_ID,
            settings: { "database-enable-actions": true },
          }),
        ]
      : [],
  );
  setupActionsEndpoints(actions);
  const productsId = checkNotNull(findField(PRODUCTS_TABLE.fields, "ID"));
  const ordersProductId = {
    ...checkNotNull(findField(ORDERS_TABLE.fields, "PRODUCT_ID")),
    table: ORDERS_TABLE,
  };
  const reviewsProductId = {
    ...checkNotNull(findField(REVIEWS_TABLE.fields, "PRODUCT_ID")),
    table: REVIEWS_TABLE,
  };
  setupTableEndpoints(ORDERS_TABLE, []);
  setupTableEndpoints(PRODUCTS_TABLE, [
    {
      origin: ordersProductId,
      // Unjustified type cast. FIXME
      origin_id: ordersProductId.id as number,
      destination: productsId,
      // Unjustified type cast. FIXME
      destination_id: productsId.id as number,
      relationship: "Mt1",
    },
    {
      origin: reviewsProductId,
      // Unjustified type cast. FIXME
      origin_id: reviewsProductId.id as number,
      destination: productsId,
      // Unjustified type cast. FIXME
      destination_id: productsId.id as number,
      relationship: "Mt1",
    },
  ]);
  setupForeignKeyCountQueryEndpoints();

  const data = ordersData ?? testDataset;
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
        ...(isModel && { id: MODEL_ID, type: "model", can_write: true }),
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(SAMPLE_PROVIDER, {
            stages: [
              {
                source: {
                  type: "table",
                  id: ordersData ? ORDERS_ID : PRODUCTS_ID,
                },
              },
            ],
          }),
        ),
      }),
      zoomedRowObjectId: getRowId(data),
      queryResults: [createMockDataset({ data })],
    }),
  });
  renderWithProviders(<ObjectDetailSidesheet />, {
    storeInitialState: state,
  });
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

function getRowId(data: DatasetData) {
  const ROW_ID_INDEX = 0;
  const rowId = data.rows[0][ROW_ID_INDEX];
  return typeof rowId === "number" || typeof rowId === "string" ? rowId : null;
}

function findField(fields: Field[] | undefined, name: string) {
  return fields?.find((field) => field.name === name);
}

describe("ObjectDetailSidesheet", () => {
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

  it("should show a null value of a row as empty (metabase#13571)", async () => {
    setup({
      ordersData: createMockDatasetData({
        cols: [
          createOrdersIdDatasetColumn(),
          createOrdersDiscountDatasetColumn(),
        ],
        rows: [[1, null]],
      }),
    });

    const objectDetail = await screen.findByTestId("object-detail");
    await waitForLoaderToBeRemoved();
    expect(within(objectDetail).getByText(/Discount/i)).toBeInTheDocument();
    expect(within(objectDetail).getByText("empty")).toBeInTheDocument();
  });

  it("moves focus into the object detail sidesheet when opened", async () => {
    setup();
    await screen.findByTestId("object-detail");
    await waitForLoaderToBeRemoved();

    await userEvent.tab();
    expect(screen.getByLabelText("Copy link to this record")).toHaveFocus();
  });

  it("re-runs the model query after an object detail action succeeds", async () => {
    setupExecuteActionEndpoint(DELETE_ACTION.id, {
      body: { "rows-deleted": [1] },
    });
    setup({ isModel: true, actions: [DELETE_ACTION] });

    await userEvent.click(await screen.findByTestId("actions-menu"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" }),
    );
    const modal = await screen.findByTestId("delete-object-modal");
    expect(mockRunQuestionQuery).not.toHaveBeenCalled();
    await userEvent.click(
      within(modal).getByRole("button", { name: "Delete forever" }),
    );

    await waitFor(() => expect(mockRunQuestionQuery).toHaveBeenCalledTimes(1));
  });
});
