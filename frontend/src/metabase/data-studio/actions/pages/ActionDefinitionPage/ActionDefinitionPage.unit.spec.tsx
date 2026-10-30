import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabaseListEndpoint,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { WritebackImplicitQueryAction } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockField,
  createMockImplicitQueryAction,
  createMockTable,
} from "metabase-types/api/mocks";

import { ActionDefinitionPage } from "./ActionDefinitionPage";

type TablePickerMockProps = {
  onChange: (table: { id: number }) => void;
};

jest.mock("../../components/ImplicitActionTablePickerModal", () => ({
  ImplicitActionTablePickerModal: ({ onChange }: TablePickerMockProps) => (
    <button onClick={() => onChange({ id: 20 })}>Pick Orders</button>
  ),
}));

const DATABASE = createMockDatabase({
  id: 1,
  name: "Shop",
  settings: { "database-enable-actions": true },
});

const TABLE = createMockTable({
  id: 10,
  db_id: 1,
  db: DATABASE,
  schema: "public",
  display_name: "Customers",
  fields: [
    createMockField({
      id: 100,
      table_id: 10,
      name: "ID",
      semantic_type: "type/PK",
    }),
  ],
});

type SetupOpts = {
  action: WritebackImplicitQueryAction;
};

const OTHER_TABLE = createMockTable({
  id: 20,
  db_id: 1,
  db: DATABASE,
  schema: "public",
  display_name: "Orders",
  fields: [
    createMockField({
      id: 200,
      table_id: 20,
      name: "ID",
      semantic_type: "type/PK",
    }),
  ],
});

function setup({ action }: SetupOpts) {
  setupActionEndpoints(action);
  setupTableQueryMetadataEndpoint(TABLE);
  setupTableQueryMetadataEndpoint(OTHER_TABLE);
  setupDatabaseListEndpoint([DATABASE]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });

  renderWithProviders(
    <Route
      path="/data-studio/data-actions/:actionId"
      element={<ActionDefinitionPage />}
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: `/data-studio/data-actions/${action.id}`,
    },
  );
}

async function getLastUpdate() {
  return fetchMock.callHistory.lastCall("action-2-put")?.request?.json();
}

describe("ActionDefinitionPage", () => {
  it("should show the table and the operation of a table action", async () => {
    setup({
      action: createMockImplicitQueryAction({
        id: 2,
        model_id: null,
        table_id: TABLE.id,
        kind: "row/update",
        can_write: true,
      }),
    });

    expect(await screen.findByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Shop")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Update" })).toBeChecked();
    expect(
      screen.getByText(
        "Changes one row, found by its primary key. Empty fields keep their value.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change table" }),
    ).toBeInTheDocument();
  });

  it("should save a new operation right away and undo it from the toast", async () => {
    setup({
      action: createMockImplicitQueryAction({
        id: 2,
        model_id: null,
        table_id: TABLE.id,
        kind: "row/create",
        can_write: true,
      }),
    });

    await userEvent.click(await screen.findByRole("radio", { name: "Delete" }));

    await waitFor(async () =>
      expect(await getLastUpdate()).toEqual({ id: 2, kind: "row/delete" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(async () =>
      expect(await getLastUpdate()).toEqual({ id: 2, kind: "row/create" }),
    );
  });

  it("should save a new table right away and undo it from the toast", async () => {
    setup({
      action: createMockImplicitQueryAction({
        id: 2,
        model_id: null,
        table_id: TABLE.id,
        kind: "row/create",
        can_write: true,
      }),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Change table" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Pick Orders" }));

    await waitFor(async () =>
      expect(await getLastUpdate()).toEqual({
        id: 2,
        table_id: OTHER_TABLE.id,
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(async () =>
      expect(await getLastUpdate()).toEqual({ id: 2, table_id: TABLE.id }),
    );
  });

  it("should show the server's reason when a change can't be saved", async () => {
    setup({
      action: createMockImplicitQueryAction({
        id: 2,
        model_id: null,
        table_id: TABLE.id,
        kind: "row/create",
        can_write: true,
      }),
    });
    fetchMock.modifyRoute("action-2-put", {
      response: {
        status: 400,
        body: "An implicit action needs a table with exactly one primary key.",
      },
    });

    await userEvent.click(await screen.findByRole("radio", { name: "Delete" }));

    expect(
      await screen.findByText(
        "Failed to update action: An implicit action needs a table with exactly one primary key.",
      ),
    ).toBeInTheDocument();
  });

  it("should not let a user who can't write the action change it", async () => {
    setup({
      action: createMockImplicitQueryAction({
        id: 2,
        model_id: null,
        table_id: TABLE.id,
        can_write: false,
      }),
    });

    expect(await screen.findByText("Customers")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Insert" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Change table" }),
    ).not.toBeInTheDocument();
  });
});
