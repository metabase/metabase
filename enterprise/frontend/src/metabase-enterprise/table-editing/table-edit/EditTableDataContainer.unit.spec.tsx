import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Api } from "metabase/api";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import type { RowValues } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatabase,
  createMockDataset,
  createMockField,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  type DescribeActionFormResponse,
  TableActionFormInputType,
  TableActionId,
} from "../api/types";

import { EditTableDataContainer } from "./EditTableDataContainer";

const { trackSimpleEvent } = jest.requireMock<{
  trackSimpleEvent: jest.Mock;
}>("metabase/analytics");

const DB_ID = 1;
const TABLE_ID = 10;
const EDIT_PATH = `/browse/databases/${DB_ID}/tables/${TABLE_ID}/edit`;

const COLUMNS = [
  { id: 101, name: "id", display_name: "ID", type: "type/BigInteger" },
  { id: 102, name: "name", display_name: "Name", type: "type/Text" },
  { id: 103, name: "score", display_name: "Score", type: "type/Integer" },
  { id: 104, name: "created", display_name: "Created", type: "type/Date" },
  {
    id: 105,
    name: "updated_at",
    display_name: "Updated At",
    type: "type/DateTime",
  },
  { id: 106, name: "active", display_name: "Active", type: "type/Boolean" },
];

const getSemanticType = (name: string) => (name === "id" ? "type/PK" : null);

const FIELDS = COLUMNS.map(({ id, name, display_name, type }) =>
  createMockField({
    id,
    table_id: TABLE_ID,
    name,
    display_name,
    base_type: type,
    effective_type: type,
    semantic_type: getSemanticType(name),
  }),
);

const TABLE = createMockTable({
  id: TABLE_ID,
  db_id: DB_ID,
  name: "scores",
  display_name: "Scores",
  is_writable: true,
  fields: FIELDS,
});

const COLS = COLUMNS.map(({ id, name, display_name, type }) =>
  createMockColumn({
    id,
    table_id: TABLE_ID,
    name,
    display_name,
    base_type: type,
    effective_type: type,
    semantic_type: getSemanticType(name),
    source: "fields",
    field_ref: ["field", id, null],
  }),
);

const ROWS: RowValues[] = [
  [1, "Alpha", 10, "2020-02-01", "2020-02-01T10:00:00", false],
  [2, "Bravo", 20, "2020-02-02", "2020-02-02T10:00:00", false],
  [3, "Charlie", 30, "2020-02-03", "2020-02-03T10:00:00", false],
];

const UPDATE_FORM: DescribeActionFormResponse = {
  title: "Update",
  parameters: [
    {
      id: "id",
      display_name: "ID",
      input_type: TableActionFormInputType.Integer,
      readonly: true,
    },
    {
      id: "name",
      display_name: "Name",
      input_type: TableActionFormInputType.Text,
    },
    {
      id: "score",
      display_name: "Score",
      input_type: TableActionFormInputType.Integer,
    },
    {
      id: "created",
      display_name: "Created",
      input_type: TableActionFormInputType.Date,
    },
    {
      id: "updated_at",
      display_name: "Updated At",
      input_type: TableActionFormInputType.DateTime,
    },
    {
      id: "active",
      display_name: "Active",
      input_type: TableActionFormInputType.Boolean,
      nullable: true,
    },
  ],
};

const CREATE_FORM: DescribeActionFormResponse = {
  title: "Create",
  parameters: [
    {
      id: "name",
      display_name: "Name",
      input_type: TableActionFormInputType.Text,
    },
    {
      id: "score",
      display_name: "Score",
      input_type: TableActionFormInputType.Integer,
      optional: true,
    },
  ],
};

type ExecuteBulkBody = {
  action: TableActionId;
  inputs: Record<string, unknown>[];
  params?: Record<string, unknown>;
  scope: { "table-id": number };
};

function parseExecuteBulkBody(body: unknown): ExecuteBulkBody {
  return JSON.parse(String(body));
}

// Echoes the request back the way the backend reports written rows.
function executeBulk({ options }: CallLog) {
  const { action, inputs, params } = parseExecuteBulkBody(options.body);

  switch (action) {
    case TableActionId.CreateRow:
      return {
        outputs: inputs.map((input, index) => ({
          op: "created",
          "table-id": TABLE_ID,
          row: toServerRow({ id: 100 + index, ...input }),
        })),
      };
    case TableActionId.UpdateRow:
      return {
        outputs: inputs.map((input) => ({
          op: "updated",
          "table-id": TABLE_ID,
          row: toServerRow({ ...input, ...params }),
        })),
      };
    default:
      return {
        outputs: inputs.map((input) => ({
          op: "deleted",
          "table-id": TABLE_ID,
          row: input,
        })),
      };
  }
}

function toServerRow(row: Record<string, unknown>) {
  return "score" in row ? { ...row, score: Number(row.score) } : row;
}

function setup({
  isAdmin = true,
  isTableEditingEnabled = true,
  isTableWritable = true,
  initialRoute = EDIT_PATH,
}: {
  isAdmin?: boolean;
  isTableEditingEnabled?: boolean;
  isTableWritable?: boolean;
  initialRoute?: string;
} = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 1000 });
  // Edit mode builds its filter and sort URLs from `window.location`.
  window.history.pushState({}, "", EDIT_PATH);

  const table = { ...TABLE, is_writable: isTableWritable };
  const database = createMockDatabase({
    id: DB_ID,
    name: "Writable DB",
    tables: [table],
    settings: { "database-enable-table-editing": isTableEditingEnabled },
  });

  setupDatabaseEndpoints(database);
  fetchMock.get("path:/api/database", { data: [database], total: 1 });
  fetchMock.post(
    "path:/api/dataset",
    createMockDataset({ data: { cols: COLS, rows: ROWS }, row_count: 3 }),
    { name: "dataset" },
  );
  fetchMock.post("path:/api/ee/action-v2/execute-form", UPDATE_FORM, {
    body: { action: TableActionId.UpdateRow },
    matchPartialBody: true,
  });
  fetchMock.post("path:/api/ee/action-v2/execute-form", CREATE_FORM, {
    body: { action: TableActionId.CreateRow },
    matchPartialBody: true,
  });
  fetchMock.post("path:/api/ee/action-v2/execute-bulk", executeBulk, {
    name: "execute-bulk",
  });

  return renderWithProviders(
    <Route
      path="/browse/databases/:dbId/tables/:tableId/edit"
      element={<EditTableDataContainer />}
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        entities: createMockEntitiesState({ databases: [database] }),
      }),
    },
  );
}

async function setupGrid(options?: Parameters<typeof setup>[0]) {
  const view = setup(options);
  await waitForGridToSettle(view.store, { datasetRequests: 1 });
  expect(screen.getByText("Bravo")).toBeInTheDocument();
  return view;
}

/**
 * Each time the dataset, the table metadata or a form description arrives, the
 * grid builds new header and cell components for every column, and React
 * remounts those cells. A click whose pointer events straddle a remount lands
 * on a detached node and is lost, and a cell clicked before the update form
 * description arrives does not know that its column is readonly. The sort
 * indicator is read from the URL, so it shows before the dataset refetch that
 * the sort starts has finished.
 *
 * So wait for every running API request, then for the animation frame on
 * which RTK's `autoBatchEnhancer` notifies subscribers of the results, so that
 * React has rendered them before the next interaction.
 */
async function waitForGridToSettle(
  store: ReturnType<typeof setup>["store"],
  { datasetRequests }: { datasetRequests: number },
) {
  await waitFor(() =>
    expect(fetchMock.callHistory.calls("dataset")).toHaveLength(
      datasetRequests,
    ),
  );
  await act(async () => {
    await Promise.all([
      ...store.dispatch(Api.util.getRunningQueriesThunk()),
      ...store.dispatch(Api.util.getRunningMutationsThunk()),
    ]);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  await waitFor(() =>
    expect(
      screen.queryByTestId("edit-table-data-loading-overlay"),
    ).not.toBeInTheDocument(),
  );
}

function getRowSection(quadrant: string, rowIndex: number) {
  const row = within(screen.getByTestId(quadrant))
    .getAllByRole("row")
    .find((row) => row.getAttribute("data-dataset-index") === String(rowIndex));
  if (!row) {
    throw new Error(`Row ${rowIndex} is not rendered`);
  }
  return row;
}

function getCell(rowIndex: number, columnId: string) {
  const cell = within(getRowSection("center-center-quadrant", rowIndex))
    .getAllByRole("gridcell")
    .find((cell) => cell.getAttribute("data-column-id") === columnId);
  if (!cell) {
    throw new Error(`Cell ${columnId} of row ${rowIndex} is not rendered`);
  }
  return cell;
}

/**
 * The header remounts each time the grid gets new data, so query it again for
 * each assertion.
 */
function getHeader() {
  return within(screen.getByTestId("table-header"));
}

function getRowSelectSection(rowIndex: number) {
  return within(getRowSection("center-pinned-quadrant", rowIndex));
}

function getLastExecuteBulkBody(): ExecuteBulkBody {
  const call = fetchMock.callHistory.lastCall("execute-bulk");
  return parseExecuteBulkBody(call?.options.body);
}

async function dismissUndoToast(message: string) {
  const toast = await screen.findByTestId("toast-undo");
  expect(within(toast).getByText(message)).toBeInTheDocument();
  await userEvent.click(within(toast).getByLabelText("close icon"));
  await waitFor(() =>
    expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument(),
  );
}

function expectRecordModifiedEvent(
  eventDetail: "create" | "update" | "delete",
  triggeredFrom: "inline" | "modal",
  result: "success" | "error" = "success",
) {
  expect(trackSimpleEvent).toHaveBeenCalledWith({
    event: "edit_data_record_modified",
    event_detail: eventDetail,
    target_id: TABLE_ID,
    triggered_from: triggeredFrom,
    result,
  });
}

describe("EditTableDataContainer", () => {
  describe("access", () => {
    it("shows the table in edit mode to admins", async () => {
      await setupGrid();

      const root = screen.getByTestId("edit-table-data-root");
      const crumbs = within(root).getByTestId("head-crumbs-container");
      expect(within(crumbs).getByText("Edit")).toBeInTheDocument();
      // The query builder opens a new question on the `db` and `table` in the hash.
      const href = within(crumbs)
        .getByRole("link", { name: /Scores/ })
        .getAttribute("href");
      const url = new URL(checkNotNull(href), "http://localhost");
      const hashParams = new URLSearchParams(url.hash.replace(/^#\?/, ""));
      expect(url.pathname).toBe("/question");
      expect(Object.fromEntries(hashParams)).toEqual({
        db: String(DB_ID),
        table: String(TABLE_ID),
      });
      expect(within(root).getByTestId("table-root")).toBeInTheDocument();
    });

    it("does not let non-admins edit the table", async () => {
      setup({ isAdmin: false });

      expect(
        await screen.findByTestId("edit-table-data-restricted"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("You are not allowed to edit this table"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("edit-table-data-root"),
      ).not.toBeInTheDocument();
    });

    it("does not allow editing a read-only table", async () => {
      setup({ isTableWritable: false });

      expect(
        await screen.findByText("This table is read-only"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("edit-table-data-restricted"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("edit-table-data-root"),
      ).not.toBeInTheDocument();
    });

    it("does not allow editing when the database has table editing turned off", async () => {
      setup({ isTableEditingEnabled: false });

      expect(
        await screen.findByText(
          "Table editing is not enabled for this database",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("edit-table-data-restricted"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("edit-table-data-root"),
      ).not.toBeInTheDocument();
    });
  });

  describe("row modal", () => {
    it("edits a row in the modal", async () => {
      await setupGrid();

      await userEvent.click(
        getRowSelectSection(1).getByTestId("row-edit-icon"),
      );

      const modal = await screen.findByRole("dialog");
      expect(within(modal).getByText("Edit record")).toBeInTheDocument();
      expect(within(modal).getByTestId("ID-field-input")).toHaveValue("2");

      const scoreInput = within(modal).getByTestId("Score-field-input");
      await userEvent.clear(scoreInput);
      await userEvent.type(scoreInput, "123");
      await userEvent.tab();
      await userEvent.click(
        within(modal).getByTestId("update-row-save-button"),
      );

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(getLastExecuteBulkBody()).toEqual({
        action: TableActionId.UpdateRow,
        inputs: [{ id: 2 }],
        params: { score: "123" },
        scope: { "table-id": TABLE_ID },
      });
      await dismissUndoToast("Successfully updated");
      expect(getCell(1, "score")).toHaveTextContent("123");
      expectRecordModifiedEvent("update", "modal");
    });
  });

  describe("inline editing", () => {
    it.each([
      { column: "score", value: "1234", displayValue: "1,234" },
      { column: "name", value: "test", displayValue: "test" },
    ])(
      "edits a $column cell inline",
      async ({ column, value, displayValue }) => {
        await setupGrid();

        await userEvent.click(getCell(1, column));
        const input = within(getCell(1, column)).getByRole("textbox");
        await userEvent.clear(input);
        await userEvent.type(input, value);
        expect(input).toHaveValue(value);
        await userEvent.tab();

        await dismissUndoToast("Successfully updated");
        expect(getLastExecuteBulkBody()).toEqual({
          action: TableActionId.UpdateRow,
          inputs: [{ id: 2 }],
          params: { [column]: value },
          scope: { "table-id": TABLE_ID },
        });
        expect(getCell(1, column)).toHaveTextContent(displayValue);
        expectRecordModifiedEvent("update", "inline");
      },
    );

    it("edits a date cell inline", async () => {
      await setupGrid();

      await userEvent.click(getCell(1, "created"));
      await userEvent.click(
        await screen.findByRole("button", { name: "15 February 2020" }),
      );

      await dismissUndoToast("Successfully updated");
      expect(getLastExecuteBulkBody().params).toEqual({
        created: "2020-02-15",
      });
      expect(getCell(1, "created")).toHaveTextContent("February 15, 2020");
    });

    it("edits a datetime cell inline", async () => {
      await setupGrid();

      await userEvent.click(getCell(1, "updated_at"));
      const popover = await screen.findByRole("dialog");
      await userEvent.click(
        within(popover).getByRole("button", { name: "15 February 2020" }),
      );
      const [hours, minutes] = within(popover).getAllByRole("spinbutton");
      await userEvent.type(hours, "11");
      await userEvent.type(minutes, "35");
      await userEvent.selectOptions(
        within(popover).getByRole("combobox"),
        "AM",
      );
      // The submit button has no accessible name: its only content is an
      // aria-hidden check icon. The month navigation buttons are the only
      // other unnamed buttons in the picker, and they carry a direction.
      const submitButton = within(popover)
        .getAllByRole("button", { name: "" })
        .find((button) => !button.hasAttribute("data-direction"));
      await userEvent.click(checkNotNull(submitButton));

      await dismissUndoToast("Successfully updated");
      expect(getLastExecuteBulkBody().params).toEqual({
        updated_at: "2020-02-15T11:35:00",
      });
      expect(getCell(1, "updated_at")).toHaveTextContent(
        "February 15, 2020, 11:35 AM",
      );
    });

    it("edits a boolean cell inline through its select", async () => {
      await setupGrid();

      await userEvent.click(getCell(1, "active"));
      // True, False and None, as the column is nullable
      expect(await screen.findAllByRole("option")).toHaveLength(3);
      await userEvent.click(screen.getByRole("option", { name: "True" }));

      await dismissUndoToast("Successfully updated");
      expect(getLastExecuteBulkBody().params).toEqual({ active: "true" });
      expect(getCell(1, "active")).toHaveTextContent("true");
    });

    it("does not make a cell editable when the form description marks its column readonly", async () => {
      await setupGrid();

      await userEvent.click(getCell(1, "id"));

      expect(getCell(1, "id")).toHaveTextContent("2");
      expect(
        within(getCell(1, "id")).queryByRole("textbox"),
      ).not.toBeInTheDocument();
    });

    it("shows an error toast when the backend rejects an inline edit", async () => {
      await setupGrid();
      // What `POST /api/ee/action-v2/execute-bulk` sends when Postgres rejects
      // an update with an error the driver has no parser for.
      fetchMock.modifyRoute("execute-bulk", {
        response: {
          status: 400,
          body: {
            errors: [
              {
                index: 0,
                error: "ERROR: smallint out of range",
                message: "ERROR: smallint out of range",
                "status-code": 400,
              },
            ],
          },
        },
      });

      await userEvent.click(getCell(1, "score"));
      const input = within(getCell(1, "score")).getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "9999999");
      await userEvent.tab();

      expect(
        await screen.findByText("Couldn't save table changes"),
      ).toBeInTheDocument();
      expectRecordModifiedEvent("update", "inline", "error");

      await userEvent.click(screen.getByRole("button", { name: "More info" }));
      expect(
        screen.getByText("Couldn't save table changes:"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("ERROR: smallint out of range"),
      ).toBeInTheDocument();
    });
  });

  describe("filter and sort", () => {
    it("cycles a column sort through ascending, descending and none", async () => {
      const { router, store } = await setupGrid();

      await userEvent.click(getHeader().getByText("Name"));
      await waitForGridToSettle(store, { datasetRequests: 2 });
      expect(getHeader().getByLabelText("chevronup icon")).toBeInTheDocument();
      expect(getHeader().getAllByTestId("header-sort-indicator")).toHaveLength(
        1,
      );
      expect(router?.location.search).toMatch(/^\?query=/);

      await userEvent.click(getHeader().getByText("Name"));
      await waitForGridToSettle(store, { datasetRequests: 3 });
      expect(
        getHeader().getByLabelText("chevrondown icon"),
      ).toBeInTheDocument();

      await userEvent.click(getHeader().getByText("Name"));
      await waitFor(() =>
        expect(
          getHeader().queryByTestId("header-sort-indicator"),
        ).not.toBeInTheDocument(),
      );
      expect(router?.location.search).toBe("");
    });

    it("adds a filter and keeps filter and sort in the URL across reloads", async () => {
      const { router, store, unmount } = await setupGrid();

      await userEvent.click(screen.getByText("Filter"));
      await userEvent.click(await screen.findByRole("heading", { name: "ID" }));
      await userEvent.click(await screen.findByText("Is"));
      await userEvent.click(await screen.findByText("Not empty"));
      await userEvent.click(await screen.findByText("Apply filter"));

      expect(
        await screen.findByTestId("filters-visibility-control"),
      ).toHaveTextContent("1");
      await waitForGridToSettle(store, { datasetRequests: 2 });

      await userEvent.click(getHeader().getByText("Name"));
      await waitForGridToSettle(store, { datasetRequests: 3 });
      expect(getHeader().getByLabelText("chevronup icon")).toBeInTheDocument();

      const lastQuery = JSON.parse(
        String(fetchMock.callHistory.lastCall("dataset")?.options.body),
      );
      expect(lastQuery.stages[0].filters).toHaveLength(1);
      expect(lastQuery.stages[0]["order-by"]).toHaveLength(1);

      const reloadRoute = `${router?.location.pathname}${router?.location.search}`;
      unmount();
      fetchMock.removeRoutes();
      fetchMock.clearHistory();
      await setupGrid({ initialRoute: reloadRoute });

      expect(
        await screen.findByTestId("filters-visibility-control"),
      ).toHaveTextContent("1");
      expect(getHeader().getByLabelText("chevronup icon")).toBeInTheDocument();

      const filtersPanel = screen.getByTestId("qb-filters-panel");
      expect(
        within(filtersPanel).getByText("ID is not empty"),
      ).toBeInTheDocument();
      await userEvent.click(
        within(filtersPanel).getByRole("button", { name: "Remove" }),
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId("filters-visibility-control"),
        ).not.toBeInTheDocument(),
      );
    });
  });

  describe("creating and deleting rows", () => {
    it("creates a row from the new record modal", async () => {
      await setupGrid();

      await userEvent.click(screen.getByTestId("new-record-button"));
      const modal = await screen.findByRole("dialog");
      expect(
        within(modal).getByText("Create a new record"),
      ).toBeInTheDocument();

      await userEvent.type(
        within(modal).getByTestId("Name-field-input"),
        "New York Bricks",
      );
      await userEvent.type(
        within(modal).getByTestId("Score-field-input"),
        "987",
      );
      await userEvent.click(
        within(modal).getByTestId("create-row-form-submit-button"),
      );

      await dismissUndoToast("Record successfully created");
      expect(getLastExecuteBulkBody()).toEqual({
        action: TableActionId.CreateRow,
        inputs: [{ name: "New York Bricks", score: "987" }],
        scope: { "table-id": TABLE_ID },
      });
      expect(getCell(3, "name")).toHaveTextContent("New York Bricks");
      expect(getCell(3, "score")).toHaveTextContent("987");
      expectRecordModifiedEvent("create", "modal");
    });

    it("bulk deletes the selected rows", async () => {
      await setupGrid();
      expect(screen.getAllByTestId("row-edit-icon")).toHaveLength(3);

      await userEvent.click(
        getRowSelectSection(0).getByTestId("row-select-checkbox"),
      );
      await userEvent.click(
        getRowSelectSection(1).getByTestId("row-select-checkbox"),
      );

      expect(screen.queryByTestId("row-edit-icon")).not.toBeInTheDocument();
      const bulkBar = screen.getByTestId("toast-card");
      expect(within(bulkBar).getByText("Selected 2 rows")).toBeInTheDocument();
      await userEvent.click(within(bulkBar).getByText("Delete"));

      const modal = await screen.findByRole("dialog");
      expect(within(modal).getByText("Delete 2 records?")).toBeInTheDocument();
      await userEvent.click(
        within(modal).getByRole("button", { name: "Delete 2 records" }),
      );

      await dismissUndoToast("Successfully deleted");
      expect(getLastExecuteBulkBody()).toEqual({
        action: TableActionId.DeleteRow,
        inputs: [{ id: 1 }, { id: 2 }],
        scope: { "table-id": TABLE_ID },
      });
      expect(screen.queryByTestId("toast-card")).not.toBeInTheDocument();
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
      expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
      expect(screen.getByText("Charlie")).toBeInTheDocument();
      expect(screen.getAllByTestId("row-edit-icon")).toHaveLength(1);
      expectRecordModifiedEvent("delete", "modal");
    });
  });
});
