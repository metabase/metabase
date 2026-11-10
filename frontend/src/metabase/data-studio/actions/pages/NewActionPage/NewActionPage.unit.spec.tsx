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
  type?: "implicit" | "http";
  table?: Table;
  tableError?: string;
};

function setup({
  type = "implicit",
  table = TABLE,
  tableError,
}: SetupOpts = {}) {
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
      initialRoute:
        type === "http"
          ? "/data-studio/actions/new?type=http"
          : `/data-studio/actions/new?type=implicit&table=${table.id}`,
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

  it("creates HTTP action with field per request variable", async () => {
    setup({ type: "http" });

    await screen.findByRole("textbox", { name: "Body" });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(
      screen.getByRole("textbox", { name: "URL" }),
      "https://crm.example.com/deals/{{{{deal_id}}",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.type(await screen.findByLabelText("Name"), "Discount");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(
        JSON.parse(
          String(fetchMock.callHistory.lastCall("action-post")?.options?.body),
        ),
      ).toMatchObject({
        type: "http",
        method: "POST",
        url: "https://crm.example.com/deals/{{deal_id}}",
        name: "Discount",
        parameters: [{ id: "deal_id", slug: "deal_id", type: "string/=" }],
        visualization_settings: {
          fields: { deal_id: { fieldType: "string", required: true } },
        },
      }),
    );
  });

  it("does not save HTTP action whose body is not JSON object", async () => {
    setup({ type: "http" });

    await screen.findByRole("textbox", { name: "Body" });
    await userEvent.type(
      screen.getByRole("textbox", { name: "URL" }),
      "https://crm.example.com",
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Body" }), "[[1]");

    expect(
      await screen.findByText("The body needs to be a JSON object."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
