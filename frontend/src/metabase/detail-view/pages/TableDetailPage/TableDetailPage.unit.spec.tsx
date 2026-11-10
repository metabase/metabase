import type { CallLog } from "fetch-mock";

import {
  setupAdhocQueryEndpoint,
  setupListDatabaseSchemasEndpoint,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  getIcon,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { Nav } from "metabase/detail-view/components";
import { useSelector } from "metabase/redux";
import { Route } from "metabase/router";
import { getDetailViewState } from "metabase/selectors/app";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Dataset, RowValues } from "metabase-types/api";
import {
  createMockDataset,
  createMockDatasetData,
  createMockForeignKey,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  SAMPLE_DB_ID,
  createOrdersProductIdField,
  createOrdersTable,
  createProductsTable,
  createProductsTableDatasetColumns,
  createReviewsProductIdField,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { TableDetailPage } from "./TableDetailPage";

registerVisualizations();

const SAMPLE_DATABASE = createSampleDatabase();

const PRODUCTS_TABLE = createProductsTable({
  db: createSampleDatabase({ tables: [] }),
});

const FOREIGN_KEYS = [
  createMockForeignKey({
    origin: createOrdersProductIdField({ table: createOrdersTable() }),
    origin_id: ORDERS.PRODUCT_ID,
    destination_id: PRODUCTS.ID,
  }),
  createMockForeignKey({
    origin: createReviewsProductIdField({ table: createReviewsTable() }),
    origin_id: REVIEWS.PRODUCT_ID,
    destination_id: PRODUCTS.ID,
  }),
];

const PRODUCT_ROW: RowValues = [
  1,
  "1018947080336",
  "Rustic Paper Wallet",
  "Gizmo",
  "Swaniawski, Casper and Hilll",
  29.46,
  4.6,
  "2026-07-19T19:44:56.582Z",
];

const RELATED_ROW_COUNTS: Record<number, number> = {
  [ORDERS_ID]: 93,
  [REVIEWS_ID]: 8,
};

const DetailViewNav = () => {
  const detailView = useSelector(getDetailViewState);
  return detailView ? <Nav detailView={detailView} /> : null;
};

interface SetupOpts {
  rowId: number;
  rows: RowValues[];
}

function setup({ rowId, rows }: SetupOpts) {
  setupTableEndpoints(PRODUCTS_TABLE, FOREIGN_KEYS);
  setupListDatabaseSchemasEndpoint(SAMPLE_DB_ID, ["PUBLIC"]);
  setupAdhocQueryEndpoint((call) => getDatasetResponse(call, rows));

  renderWithProviders(
    <Route
      path="/table/:tableId/detail/:rowId"
      element={
        <>
          <DetailViewNav />
          <TableDetailPage />
        </>
      }
    />,
    {
      withRouter: true,
      initialRoute: `/table/${PRODUCTS_ID}/detail/${rowId}`,
      storeInitialState: createMockState({
        entities: createMockEntitiesState({ databases: [SAMPLE_DATABASE] }),
      }),
    },
  );
}

function getDatasetResponse(call: CallLog, rows: RowValues[]): Dataset {
  const body = String(call.options.body);
  const isCountQuery = body.includes("aggregation");

  if (isCountQuery) {
    const sourceTableId = Object.keys(RELATED_ROW_COUNTS)
      .map(Number)
      .find((tableId) => body.includes(`"source-table":${tableId}`));
    const count = sourceTableId != null ? RELATED_ROW_COUNTS[sourceTableId] : 0;

    return createMockDataset({
      data: createMockDatasetData({ rows: [[count]] }),
    });
  }

  return createMockDataset({
    data: createMockDatasetData({
      cols: createProductsTableDatasetColumns(),
      rows,
    }),
  });
}

function getDetailRows() {
  return within(screen.getByTestId("object-details"))
    .getAllByTestId("object-details-row")
    .map((row) => [
      within(row).getByTestId("column-name").textContent,
      within(row).getByTestId("value").textContent,
    ]);
}

describe("TableDetailPage", () => {
  it("shows a loading indicator and then 'Row not found' for a missing row", async () => {
    setup({ rowId: 9999, rows: [] });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();

    expect(
      await screen.findByRole("heading", { name: "Row not found" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Sample Database/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByText("9999")).toBeInTheDocument();
  });

  it("shows the header, breadcrumbs, details and relationships of a row", async () => {
    setup({ rowId: 1, rows: [PRODUCT_ROW] });

    expect(
      await screen.findByRole("heading", {
        name: "Rustic Paper Wallet",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "1", level: 2 }),
    ).toBeInTheDocument();
    expect(getIcon("document")).toBeInTheDocument();

    expect(
      await screen.findByRole("link", { name: /Sample Database/ }),
    ).toHaveAttribute(
      "href",
      `/browse/databases/${SAMPLE_DB_ID}-sample-database`,
    );
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute(
      "href",
      `/table/${PRODUCTS_ID}-products`,
    );

    expect(getDetailRows()).toEqual([
      ["ID", "1"],
      ["Ean", "1018947080336"],
      ["Title", "Rustic Paper Wallet"],
      ["Category", "Gizmo"],
      ["Vendor", "Swaniawski, Casper and Hilll"],
      ["Price", "29.46"],
      ["Rating", "4.6"],
      ["Created At", "July 19, 2026, 7:44 PM"],
    ]);

    const relationships = screen.getByTestId("relationships");
    expect(
      within(relationships).getByText("Rustic Paper Wallet"),
    ).toBeInTheDocument();
    expect(
      await within(relationships).findByRole("link", { name: "93 Orders" }),
    ).toBeInTheDocument();
    expect(
      await within(relationships).findByRole("link", { name: "8 Reviews" }),
    ).toBeInTheDocument();
  });
});
