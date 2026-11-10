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
import type { WritebackAction } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockField,
  createMockHttpAction,
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
  action: WritebackAction;
  isEditRoute?: boolean;
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

function setup({ action, isEditRoute = false }: SetupOpts) {
  setupActionEndpoints(action);
  setupTableQueryMetadataEndpoint(TABLE);
  setupTableQueryMetadataEndpoint(OTHER_TABLE);
  setupDatabaseListEndpoint([DATABASE]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });

  renderWithProviders(
    <>
      <Route
        path="/data-studio/data-actions/:actionId"
        element={<ActionDefinitionPage />}
      />
      <Route
        path="/data-studio/data-actions/:actionId/edit"
        element={<ActionDefinitionPage />}
      />
    </>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: `/data-studio/data-actions/${action.id}${isEditRoute ? "/edit" : ""}`,
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

  describe("HTTP actions", () => {
    const HTTP_ACTION = createMockHttpAction({
      id: 2,
      method: "PUT",
      url: "https://crm.example.com/deals/{{deal_id}}",
      headers: { "X-Source": "metabase" },
      body: { discount: "{{discount}}" },
      parameters: [
        {
          id: "deal_id",
          slug: "deal_id",
          name: "Deal ID",
          type: "number/=",
          target: ["variable", ["template-tag", "deal_id"]],
          required: true,
        },
      ],
      can_write: true,
    });

    it("shows request read-only with link to edit it", async () => {
      setup({ action: HTTP_ACTION });

      expect(await screen.findByRole("textbox", { name: "URL" })).toHaveValue(
        "https://crm.example.com/deals/{{deal_id}}",
      );
      expect(screen.getByRole("textbox", { name: "URL" })).toBeDisabled();
      expect(screen.getByLabelText("Method")).toHaveValue("PUT");
      expect(screen.getByDisplayValue("X-Source")).toBeInTheDocument();
      expect(screen.getByText("No query parameters")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Edit definition" }),
      ).toHaveAttribute("href", "/data-studio/actions/2/edit");
    });

    it("does not offer to edit request without write access", async () => {
      setup({ action: { ...HTTP_ACTION, can_write: false } });

      expect(
        await screen.findByRole("textbox", { name: "URL" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Edit definition" }),
      ).not.toBeInTheDocument();
    });

    it("saves edited request with parameters of its variables", async () => {
      setup({ action: HTTP_ACTION, isEditRoute: true });

      await screen.findByRole("textbox", { name: "Body" });
      await userEvent.type(
        screen.getByRole("textbox", { name: "URL" }),
        "?note={{{{note}}",
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(fetchMock.callHistory.called("action-2-put")).toBe(true),
      );
      expect(await getLastUpdate()).toMatchObject({
        method: "PUT",
        url: "https://crm.example.com/deals/{{deal_id}}?note={{note}}",
        headers: { "X-Source": "metabase" },
        body: { discount: "{{discount}}" },
        parameters: [
          { id: "deal_id", type: "number/=", name: "Deal ID" },
          { id: "note", slug: "note", type: "string/=" },
          { id: "discount", slug: "discount", type: "string/=" },
        ],
      });
    });
  });
});
