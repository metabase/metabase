import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { setupJestCanvasMock } from "jest-canvas-mock";

import { act, screen, waitFor, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Card, DatasetColumn, Field } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { getIsRunning } from "../store/selectors";

import { setup } from "./test-utils";

type QueryBuilderStore = Awaited<ReturnType<typeof setup>>["store"];

const QUERY_RUN_PATH = /^\/api\/(card\/\d+\/query|dataset)$/;

registerVisualizations();

const MODEL_ID = 1;

const NATIVE_QUERY = Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
  query: "SELECT * FROM ORDERS LIMIT 5",
});

const createColumn = (
  name: string,
  baseType: string,
  opts: Partial<DatasetColumn> = {},
) =>
  createMockColumn({
    name,
    display_name: name,
    base_type: baseType,
    effective_type: baseType,
    semantic_type: null,
    source: "native",
    field_ref: ["field", name, { "base-type": baseType }],
    ...opts,
  });

const ORDERS_COLUMNS = [
  createColumn("ID", "type/BigInteger"),
  createColumn("USER_ID", "type/Integer"),
  createColumn("PRODUCT_ID", "type/Integer"),
  createColumn("SUBTOTAL", "type/Float"),
  createColumn("TAX", "type/Float"),
  createColumn("TOTAL", "type/Float"),
  createColumn("DISCOUNT", "type/Float"),
  createColumn("CREATED_AT", "type/DateTime"),
  createColumn("QUANTITY", "type/Integer"),
];

const ORDERS_ROWS = [
  [1, 1, 14, 37.65, 2.07, 39.72, null, "2028-02-11T21:40:27.892", 2],
  [2, 1, 123, 110.93, 6.1, 117.03, null, "2027-05-15T08:04:04.58", 3],
];

const MINI_BAR_COLUMNS = ORDERS_COLUMNS.map((column) =>
  column.name === "SUBTOTAL"
    ? {
        ...column,
        semantic_type: "type/Quantity",
        settings: { show_mini_bar: true },
      }
    : column,
);

const toResultMetadata = (columns: DatasetColumn[]) =>
  // The API returns dataset columns as the model metadata, which `Field` does not type.
  columns as unknown as Field[];

const getResultColumns = (card: Card) =>
  // The API returns dataset columns as the model metadata, which `Field` does not type.
  (card.result_metadata as unknown as DatasetColumn[] | null) ?? ORDERS_COLUMNS;

const createModel = ({
  result_metadata = ORDERS_COLUMNS,
  ...opts
}: Partial<Omit<Card, "result_metadata">> & {
  result_metadata?: DatasetColumn[];
} = {}) =>
  createMockCard({
    id: MODEL_ID,
    name: "Native Model",
    type: "model",
    display: "table",
    dataset_query: Lib.toJsQuery(NATIVE_QUERY),
    result_metadata: toResultMetadata(result_metadata),
    ...opts,
  });

const createDataset = (cols: DatasetColumn[]) =>
  createMockDataset({
    data: { rows: ORDERS_ROWS, cols },
    database_id: SAMPLE_DB_ID,
    status: "completed",
    row_count: ORDERS_ROWS.length,
  });

const parseBody = (body: unknown): Partial<Card> => {
  const card: unknown = JSON.parse(String(checkNotNull(body)));
  // The app under test builds these request bodies from its Card objects
  return card as Partial<Card>;
};

/**
 * Stands in for the backend: a PUT stores the card, and later reads of the card
 * and runs of its query return the stored card and its model metadata.
 * The routes are added before the shared QueryBuilder setup, so they match
 * first.
 */
const setupStoredModelEndpoints = (card: Card) => {
  let storedCard = card;
  const getDataset = () => createDataset(getResultColumns(storedCard));

  fetchMock.get(`path:/api/card/${card.id}`, () => storedCard);
  fetchMock.put(`path:/api/card/${card.id}`, (call) => {
    storedCard = { ...storedCard, ...parseBody(call.options.body) };
    return storedCard;
  });
  fetchMock.post("path:/api/dataset", getDataset);
  fetchMock.post(`path:/api/card/${card.id}/query`, getDataset);
};

type SetupOpts = {
  card?: Card;
  withUndos?: boolean;
};

const setupModel = async ({
  card = createModel(),
  withUndos = false,
}: SetupOpts = {}) => {
  setupStoredModelEndpoints(card);
  return setup({
    card,
    dataset: createDataset(getResultColumns(card)),
    initialRoute: `/model/${card.id}`,
    withUndos,
  });
};

const getUpdatedCard = () =>
  parseBody(
    fetchMock.callHistory.lastCall(`path:/api/card/${MODEL_ID}`, {
      method: "PUT",
    })?.options.body,
  );

const getCreatedCard = () =>
  parseBody(
    fetchMock.callHistory.lastCall("path:/api/card", { method: "POST" })
      ?.options.body,
  );

const openQuestionActions = async () => {
  await userEvent.click(screen.getByLabelText("Move, trash, and more…"));
};

/**
 * Waits for the requests in flight and for the query run to end. A run that
 * ends after a change in the editor puts back the card it started with, so the
 * tests change the model only once the editor has its results, as a user does.
 */
const waitForQueryToSettle = async (store: QueryBuilderStore) => {
  await act(() => fetchMock.callHistory.flush(true));
  await waitFor(() => expect(getIsRunning(store.getState())).toBe(false));
};

const openMetadataEditor = async (store: QueryBuilderStore) => {
  await openQuestionActions();
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /Edit metadata/ }),
  );
  await screen.findByTestId("dataset-edit-bar");
  await waitForQueryToSettle(store);
};

const clickEditorTab = async (store: QueryBuilderStore, name: string) => {
  await userEvent.click(
    within(screen.getByTestId("dataset-edit-bar")).getByText(name),
  );
  await waitForQueryToSettle(store);
};

const getQueryRunCount = () =>
  fetchMock.callHistory
    .calls()
    .filter((call) => QUERY_RUN_PATH.test(new URL(call.url).pathname)).length;

/** Saves the model and waits for the query that runs after the save to end. */
const saveModelChanges = async (store: QueryBuilderStore) => {
  const runCount = getQueryRunCount();
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => {
    expect(screen.queryByTestId("dataset-edit-bar")).not.toBeInTheDocument();
  });
  await waitFor(() => expect(getQueryRunCount()).toBeGreaterThan(runCount));
  await waitFor(() => expect(getIsRunning(store.getState())).toBe(false));
};

const openListViewSettings = async (store: QueryBuilderStore) => {
  await openMetadataEditor(store);
  await clickEditorTab(store, "Settings");
  const sidebar = screen.getByTestId("sidebar-right");
  expect(within(sidebar).getByText("Model Settings")).toBeInTheDocument();
  await userEvent.click(within(sidebar).getByText("List"));
  await screen.findByTestId("list-view");
};

const getRightColumnsInput = () =>
  within(screen.getByTestId("list-view-right-columns")).getByRole("textbox");

const pickRightColumn = async (search: string, columnName: string) => {
  await userEvent.type(getRightColumnsInput(), search);
  const listbox = await screen.findByRole("listbox");
  await userEvent.click(
    within(listbox).getByRole("option", { name: columnName }),
  );
};

describe("QueryBuilder > models list view", () => {
  mockGetBoundingClientRect();

  beforeEach(() => {
    setupJestCanvasMock();
  });

  it("sets list as the default view of a model and saves it", async () => {
    const { store } = await setupModel();

    await openListViewSettings(store);
    expect(screen.getByTestId("list-view")).toBeInTheDocument();

    await clickEditorTab(store, "Columns");
    await clickEditorTab(store, "Settings");
    expect(await screen.findByTestId("list-view")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("sidebar-right")).getByLabelText("List"),
    ).toBeChecked();

    await saveModelChanges(store);

    expect(getUpdatedCard()).toMatchObject({ display: "list" });
    expect(await screen.findByTestId("list-view")).toBeInTheDocument();
  });

  it("keeps the list view on a duplicate of the model", async () => {
    await setupModel({ card: createModel({ display: "list" }) });
    expect(await screen.findByTestId("list-view")).toBeInTheDocument();

    await openQuestionActions();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Duplicate/ }),
    );
    const modal = await screen.findByRole("dialog", { name: /Duplicate/ });
    await userEvent.click(
      within(modal).getByRole("button", { name: "Duplicate" }),
    );
    await waitFor(() => expect(modal).not.toBeInTheDocument());

    expect(getCreatedCard()).toMatchObject({
      name: "Native Model - Duplicate",
      type: "model",
      display: "list",
    });
    expect(
      await within(screen.getByTestId("qb-header")).findByText(
        "Native Model - Duplicate",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("list-view")).toBeInTheDocument();
  });

  it("changes the list view to a table when the model turns back into a question", async () => {
    await setupModel({
      card: createModel({ display: "list" }),
      withUndos: true,
    });
    expect(
      within(screen.getByTestId("qb-header")).getByText("Native Model"),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("list-view")).toBeInTheDocument();

    await openQuestionActions();
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: /Turn back to saved question/,
      }),
    );

    expect(await screen.findByTestId("toast-undo")).toHaveTextContent(
      "This is a question now",
    );
    expect(getUpdatedCard()).toMatchObject({
      type: "question",
      display: "table",
    });
    expect(await screen.findByTestId("table-root")).toBeInTheDocument();
    expect(screen.queryByTestId("list-view")).not.toBeInTheDocument();
  });

  it("customizes the list columns and icon, and saves them", async () => {
    const { store } = await setupModel();
    await openListViewSettings(store);

    await userEvent.click(
      screen.getByRole("button", { name: "Customize the List layout" }),
    );

    const leftColumns = await screen.findByTestId("list-view-left-columns");
    const rightColumns = screen.getByTestId("list-view-right-columns");
    const preview = screen.getByTestId("list-view-preview");
    const sidebar = screen.getByTestId("sidebar-right");

    expect(within(leftColumns).getByText("ID")).toBeInTheDocument();
    ["USER_ID", "PRODUCT_ID", "SUBTOTAL", "TAX"].forEach((name) => {
      expect(within(rightColumns).getByText(name)).toBeInTheDocument();
    });

    expect(
      within(preview).getByRole("img", { name: "document icon" }),
    ).toBeInTheDocument();
    expect(within(preview).getAllByText("1")).toHaveLength(2);
    expect(within(preview).getByText("14")).toBeInTheDocument();
    expect(within(preview).getByText("37.65")).toBeInTheDocument();
    expect(within(preview).getByText("2.07")).toBeInTheDocument();

    // used columns are not offered in the sidebar
    expect(within(sidebar).getByText("CREATED_AT")).toBeInTheDocument();
    expect(within(sidebar).queryByText("PRODUCT_ID")).not.toBeInTheDocument();

    await userEvent.type(getRightColumnsInput(), "{Backspace}{Backspace}");
    expect(
      within(rightColumns).queryByText("SUBTOTAL"),
    ).not.toBeInTheDocument();
    expect(within(rightColumns).queryByText("TAX")).not.toBeInTheDocument();
    expect(within(sidebar).getByText("SUBTOTAL")).toBeInTheDocument();
    expect(within(preview).queryByText("37.65")).not.toBeInTheDocument();

    await userEvent.type(
      within(sidebar).getByPlaceholderText("Find a column..."),
      "SUB",
    );
    const dataTransfer = new DataTransferStub();
    fireEvent.dragStart(within(sidebar).getByText("SUBTOTAL"), {
      dataTransfer,
    });
    fireEvent.drop(getRightColumnsInput(), { dataTransfer });

    expect(within(rightColumns).getByText("SUBTOTAL")).toBeInTheDocument();
    expect(within(sidebar).queryByText("SUBTOTAL")).not.toBeInTheDocument();
    expect(
      within(sidebar).getByText("No available columns"),
    ).toBeInTheDocument();
    expect(within(preview).getByText("37.65")).toBeInTheDocument();

    await pickRightColumn("TAX", "TAX");
    expect(within(rightColumns).getByText("TAX")).toBeInTheDocument();
    expect(within(preview).getByText("2.07")).toBeInTheDocument();

    await userEvent.type(getRightColumnsInput(), "CR");
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(1);
    await userEvent.click(
      within(listbox).getByRole("option", { name: "CREATED_AT" }),
    );
    expect(
      within(preview).getByText("February 11, 2028, 9:40 PM"),
    ).toBeInTheDocument();

    // the remove button of a pill is aria-hidden
    const taxPill = within(rightColumns).getByRole("button", { name: "TAX" });
    await userEvent.click(
      within(taxPill).getByRole("button", { hidden: true }),
    );
    expect(within(rightColumns).queryByText("TAX")).not.toBeInTheDocument();
    expect(within(preview).queryByText("2.07")).not.toBeInTheDocument();

    // DISCOUNT is null in the first row, so the preview shows an example value
    await pickRightColumn("DISC", "DISCOUNT");
    expect(within(preview).getByText("123.46")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("list-view-icon"));
    const iconMenu = await screen.findByRole("menu");
    await userEvent.click(
      within(iconMenu).getByRole("img", { name: "factory icon" }),
    );
    const accentColorButton = within(
      within(iconMenu).getByTestId("list-view-icon-colors"),
    ).getAllByRole("button")[2];
    expect(accentColorButton).toHaveStyle({
      background: "var(--mantine-color-accent1-filled)",
    });
    await userEvent.click(accentColorButton);

    const previewIcon = within(preview).getByRole("img", {
      name: "factory icon",
    });
    expect(previewIcon).toHaveStyle({
      color: "var(--mantine-color-accent1-text)",
    });

    await saveModelChanges(store);

    expect(getUpdatedCard()).toMatchObject({
      display: "list",
      visualization_settings: {
        "list.columns": {
          left: ["ID"],
          right: [
            "USER_ID",
            "PRODUCT_ID",
            "SUBTOTAL",
            "CREATED_AT",
            "DISCOUNT",
          ],
        },
        "list.entity_icon": "factory",
        "list.entity_icon_color": "accent1",
      },
    });

    const listView = await screen.findByTestId("list-view");
    ["ID", "USER_ID", "PRODUCT_ID", "SUBTOTAL"].forEach((name) => {
      expect(within(listView).getByText(name)).toBeInTheDocument();
    });
    expect(within(listView).queryByText("TAX")).not.toBeInTheDocument();
    expect(
      within(listView).getAllByRole("img", { name: "factory icon" })[0],
    ).toBeInTheDocument();
    expect(
      within(listView).getByText("February 11, 2028, 9:40 PM"),
    ).toBeInTheDocument();
    expect(within(listView).getByText("14")).toBeInTheDocument();
    expect(within(listView).getByText("37.65")).toBeInTheDocument();
    expect(within(listView).queryByText("2.07")).not.toBeInTheDocument();
  });

  it("turns off the mini bar chart of a quantity column", async () => {
    const { store } = await setupModel({
      card: createModel({ display: "list", result_metadata: MINI_BAR_COLUMNS }),
    });

    const listView = await screen.findByTestId("list-view");
    expect(
      within(listView).getAllByTestId("mini-bar-container").length,
    ).toBeGreaterThan(0);

    await openMetadataEditor(store);
    await clickEditorTab(store, "Columns");
    await userEvent.click(await screen.findByText("SUBTOTAL"));
    await userEvent.click(
      within(screen.getByTestId("sidebar-right")).getByRole("tab", {
        name: "Formatting",
      }),
    );
    const miniBarToggle = within(
      screen.getByTestId("sidebar-right"),
    ).getByLabelText("Show a mini bar chart");
    expect(miniBarToggle).toBeChecked();
    await userEvent.click(miniBarToggle);
    expect(miniBarToggle).not.toBeChecked();

    await saveModelChanges(store);

    const subtotal = getUpdatedCard().result_metadata?.find(
      (column) => column.name === "SUBTOTAL",
    );
    expect(subtotal?.settings).toMatchObject({ show_mini_bar: false });

    const savedListView = await screen.findByTestId("list-view");
    expect(within(savedListView).getByText("37.65")).toBeInTheDocument();
    expect(
      within(savedListView).queryByTestId("mini-bar-container"),
    ).not.toBeInTheDocument();
  });
});

/** jsdom has no DataTransfer, so native drag events get this stand-in. */
class DataTransferStub {
  private data = new Map<string, string>();

  setData(format: string, value: string) {
    this.data.set(format, value);
  }

  getData(format: string) {
    return this.data.get(format) ?? "";
  }
}
