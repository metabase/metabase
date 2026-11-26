import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  act,
  createMockDOMRect,
  fireEvent,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Card, DatasetQuery } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
  createOrdersTable,
  createOrdersTableDatasetColumns,
  createPeopleTable,
  createProductsTable,
  createProductsTitleDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { saveQuestion, setup } from "./test-utils";

registerVisualizations();

const ORDERS_ADHOC_CARD = createMockUnsavedCard({
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: ORDERS_ID } }],
    }),
  ),
});

describe("QueryBuilder > table columns settings", () => {
  beforeEach(() => {
    // the data grid virtualizes its columns and renders none at zero size
    mockGetBoundingClientRect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("reordering with a remapped column (metabase#39795)", () => {
    // Remapping Product ID to the product title adds a `remapped_from` column
    // to the results. This is what made the column order reset.
    const getRemappedOrdersDataset = () => {
      const cols = createOrdersTableDatasetColumns().map((col) =>
        col.name === "PRODUCT_ID" ? { ...col, remapped_to: "TITLE" } : col,
      );
      const titleCol = createProductsTitleDatasetColumn({
        display_name: "Product ID",
        remapped_from: "PRODUCT_ID",
        fk_field_id: ORDERS.PRODUCT_ID,
        field_ref: [
          "field",
          PRODUCTS.TITLE,
          { "source-field": ORDERS.PRODUCT_ID },
        ],
      });
      return createMockDataset({
        database_id: SAMPLE_DB_ID,
        status: "completed",
        row_count: 2,
        data: {
          cols: [...cols, titleCol],
          rows: [
            [
              1,
              11,
              21,
              10,
              1,
              11,
              0,
              "2025-01-01T00:00:00Z",
              2,
              "Rustic Paper",
            ],
            [2, 12, 22, 20, 2, 22, 0, "2025-01-02T00:00:00Z", 3, "Fancy Wool"],
          ],
        },
      });
    };

    it("should allow to re-order columns when a field is remapped to a different display value", async () => {
      await setup({
        card: ORDERS_ADHOC_CARD,
        dataset: getRemappedOrdersDataset(),
      });
      await screen.findByRole("columnheader", { name: "Product ID" });

      await userEvent.click(screen.getByTestId("viz-settings-button"));
      const columnList = await screen.findByTestId(
        "chart-settings-table-columns",
      );
      expect(getItemNames(columnList)).toEqual([
        "ID",
        "User ID",
        "Product ID",
        "Subtotal",
        "Tax",
        "Total",
        "Discount ($)",
        "Created At",
        "Quantity",
      ]);

      mockItemRects(columnList);
      await dragItem(columnList, { from: 0, to: 2 });

      await waitFor(() => {
        expect(getItemNames(columnList)).toEqual([
          "User ID",
          "Product ID",
          "ID",
          "Subtotal",
          "Tax",
          "Total",
          "Discount ($)",
          "Created At",
          "Quantity",
        ]);
      });
      // the table follows the new order
      expect(getColumnHeaderNames().slice(0, 3)).toEqual([
        "User ID",
        "Product ID",
        "ID",
      ]);
    });
  });
  describe("new query columns (metabase#40435)", () => {
    const CARD_ID = 40435;
    // the picker lists the columns by position, as the real sample database does
    const SAMPLE_DATABASE_IN_FIELD_ORDER = createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: checkNotNull(createOrdersTable().fields).map(
            (field, position) => ({ ...field, position }),
          ),
        }),
        createPeopleTable(),
        createProductsTable(),
      ],
    });
    const ORDERS_COLUMNS = createOrdersTableDatasetColumns();

    const getReturnedColumnNames = (datasetQuery: DatasetQuery) => {
      const query = Lib.fromJsQuery(SAMPLE_PROVIDER, datasetQuery);
      return Lib.returnedColumns(query, -1).map(
        (column) => Lib.displayInfo(query, -1, column).name,
      );
    };

    // Returns the columns that the query asks for, as the backend does
    const getDataset = (datasetQuery: DatasetQuery) => {
      const cols = getReturnedColumnNames(datasetQuery).map((name) =>
        checkNotNull(ORDERS_COLUMNS.find((col) => col.name === name)),
      );
      return createMockDataset({
        database_id: SAMPLE_DB_ID,
        status: "completed",
        row_count: 2,
        json_query: datasetQuery,
        data: {
          cols,
          rows: [cols.map((_col, index) => index + 1), cols.map(() => 7)],
        },
      });
    };

    const setupCardStore = (initialCard: Card) => {
      let storedCard = initialCard;
      fetchMock.get(`path:/api/card/${CARD_ID}`, () => storedCard);
      fetchMock.put(`path:/api/card/${CARD_ID}`, (call) => {
        storedCard = createMockCard({
          ...storedCard,
          ...JSON.parse(String(call.options.body)),
        });
        return storedCard;
      });
      fetchMock.post(`path:/api/card/${CARD_ID}/query`, () =>
        getDataset(storedCard.dataset_query),
      );
      fetchMock.post("path:/api/dataset", (call) =>
        getDataset(JSON.parse(String(call.options.body))),
      );
    };

    const getLastSavedCard = (): Card =>
      JSON.parse(
        String(
          checkNotNull(
            fetchMock.callHistory.lastCall(`path:/api/card/${CARD_ID}`, {
              method: "PUT",
            }),
          ).options.body,
        ),
      );

    const togglePickedColumns = async (columnNames: string[]) => {
      const dataStep = await screen.findByTestId("step-data-0-0");
      await userEvent.click(within(dataStep).getByLabelText("Pick columns"));
      const popover = await screen.findByRole("dialog");
      for (const columnName of columnNames) {
        await userEvent.click(within(popover).getByText(columnName));
      }
      await userEvent.click(within(dataStep).getByLabelText("Pick columns"));
    };

    const visualize = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Visualize" }));
    };

    it("should make new query columns visible by default", async () => {
      const card = createMockCard({
        id: CARD_ID,
        name: "Orders",
        display: "table",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(SAMPLE_PROVIDER, {
            stages: [{ source: { type: "table", id: ORDERS_ID } }],
          }),
        ),
      });
      setupCardStore(card);
      await setup({ card, database: SAMPLE_DATABASE_IN_FIELD_ORDER });

      await userEvent.click(screen.getByTestId("notebook-button"));
      await togglePickedColumns(["Select all", "User ID"]);
      await visualize();
      await waitFor(() => {
        expect(getColumnHeaderNames()).toEqual(["ID", "User ID"]);
      });

      await userEvent.click(screen.getByTestId("viz-settings-button"));
      const columnList = await screen.findByTestId(
        "chart-settings-table-columns",
      );
      await userEvent.click(within(columnList).getByTestId("ID-hide-button"));
      await userEvent.click(within(columnList).getByTestId("ID-show-button"));
      await saveQuestion();
      expect(
        getLastSavedCard().visualization_settings["table.columns"],
      ).toEqual([
        { name: "ID", enabled: true },
        { name: "USER_ID", enabled: true },
      ]);

      await userEvent.click(screen.getByTestId("notebook-button"));
      await togglePickedColumns(["Product ID"]);
      await saveQuestion();
      const savedCard = getLastSavedCard();
      expect(getReturnedColumnNames(savedCard.dataset_query)).toEqual([
        "ID",
        "USER_ID",
        "PRODUCT_ID",
      ]);
      expect(savedCard.visualization_settings["table.columns"]).toEqual([
        { name: "ID", enabled: true },
        { name: "USER_ID", enabled: true },
        { name: "PRODUCT_ID", enabled: true },
      ]);

      await visualize();
      await waitFor(() => {
        expect(getColumnHeaderNames()).toEqual(["ID", "User ID", "Product ID"]);
      });
      // let the save and the query run end before the test does
      await act(() => fetchMock.callHistory.flush(true));
    });
  });
});

function getItemNames(columnList: HTMLElement) {
  return within(columnList)
    .getAllByTestId(/^draggable-item-/)
    .map((item) => item.dataset.testid?.replace("draggable-item-", ""));
}

function getColumnHeaderNames() {
  return (
    within(screen.getByTestId("table-root"))
      .getAllByRole("columnheader")
      .map((header) => header.textContent)
      // the row index column has no name
      .filter((name) => name !== "")
  );
}

const ITEM_HEIGHT = 40;

/**
 * jsdom has no layout. Gives every sortable item a rect from its position in
 * the list, so dnd-kit can find the item a dragged one crosses. The drag
 * overlay's copy of an item starts where that item is.
 */
function mockItemRects(columnList: HTMLElement) {
  jest
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      if (!(this instanceof HTMLElement)) {
        return createMockDOMRect();
      }
      const isItem = this.dataset.testid?.startsWith("draggable-item-");
      const items = within(this).queryAllByTestId(/^draggable-item-/);
      // an item, or the sortable wrapper of a single item
      const item = isItem ? this : items.length === 1 ? items[0] : null;
      if (item == null) {
        return createMockDOMRect();
      }
      const testIds = within(columnList)
        .getAllByTestId(/^draggable-item-/)
        .map((item) => item.dataset.testid);
      const y = testIds.indexOf(item.dataset.testid) * ITEM_HEIGHT;
      return createMockDOMRect({
        x: 0,
        y,
        top: y,
        left: 0,
        width: 300,
        height: ITEM_HEIGHT,
        right: 300,
        bottom: y + ITEM_HEIGHT,
      });
    });
}

async function dragItem(
  columnList: HTMLElement,
  { from, to }: { from: number; to: number },
) {
  const items = within(columnList).getAllByTestId(/^draggable-item-/);
  const testId = items[from].dataset.testid ?? "";
  const startY = from * ITEM_HEIGHT + ITEM_HEIGHT / 2;
  // dnd-kit picks the item the dragged one overlaps most
  const endY = to * ITEM_HEIGHT + (ITEM_HEIGHT * 3) / 4;

  fireEvent.mouseDown(items[from], { button: 0, clientX: 10, clientY: startY });
  fireEvent.mouseMove(document, { clientX: 10, clientY: startY + 20 });
  fireEvent.mouseMove(document, { clientX: 10, clientY: endY });
  fireEvent.mouseUp(document, { clientX: 10, clientY: endY });
  // The drag overlay renders a copy of the item until its drop animation ends
  await waitFor(() => {
    expect(screen.getAllByTestId(testId)).toHaveLength(1);
  });
}
