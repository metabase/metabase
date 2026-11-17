import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionsEndpoints,
  setupCollectionsEndpoints,
  setupDatabaseListEndpoint,
  setupTableQueryMetadataEndpoint,
  setupTableQueryMetadataEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { Table } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import { NewActionPage } from "./NewActionPage";

const DATABASE = createMockDatabase({
  id: 1,
  name: "Shop",
  native_permissions: "write",
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
  table?: Table;
  tableError?: string;
};

function setup({ table = TABLE, tableError }: SetupOpts = {}) {
  if (tableError != null) {
    setupTableQueryMetadataEndpointError(table.id, tableError);
  } else {
    setupTableQueryMetadataEndpoint(table);
  }
  setupDatabaseListEndpoint([DATABASE]);
  setupActionsEndpoints([]);
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: createMockCollection({
      ...ROOT_COLLECTION,
      namespace: "data-actions",
    }),
  });

  renderWithProviders(
    <>
      <Route path="/data-studio/actions/new" element={<NewActionPage />} />
      <Route path="*" element={<div />} />
    </>,
    {
      withRouter: true,
      initialRoute: `/data-studio/actions/new?table=${table.id}`,
    },
  );
}

describe("NewActionPage", () => {
  it("should open a table action that inserts into the picked table", async () => {
    setup();

    expect(await screen.findByText("Customers")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Insert" })).toBeChecked();
    expect(screen.getByPlaceholderText("Insert Customers")).toBeInTheDocument();
  });

  it("should create a table action with the picked operation", async () => {
    setup();

    await userEvent.click(await screen.findByRole("radio", { name: "Delete" }));
    expect(
      await screen.findByPlaceholderText("Delete Customers"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByLabelText("Name")).toHaveValue(
      "Delete Customers",
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(
        JSON.parse(
          String(fetchMock.callHistory.lastCall("action-post")?.options?.body),
        ),
      ).toMatchObject({
        type: "implicit",
        kind: "row/delete",
        table_id: TABLE.id,
        name: "Delete Customers",
      }),
    );
  });

  it("should not save an action for a table without a single primary key", async () => {
    setup({ table: createMockTable({ ...TABLE, fields: [] }) });

    expect(
      await screen.findByText(
        "Actions can only write to a table with exactly one primary key.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("should say why the table can't be loaded", async () => {
    setup({ tableError: "Table not found" });

    expect(await screen.findByText("Table not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
