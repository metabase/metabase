import {
  setupActionEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabaseListEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { Database, WritebackQueryAction } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockQueryAction,
  createMockTemplateTag,
} from "metabase-types/api/mocks";

import { ActionFieldsPage } from "./ActionFieldsPage";

type SetupOpts = {
  action: WritebackQueryAction;
  database: Database;
  fieldId?: string;
};

function setup({ action, database, fieldId = "status" }: SetupOpts) {
  setupActionEndpoints(action);
  setupDatabaseListEndpoint([database]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });

  renderWithProviders(
    <>
      <Route
        path="/data-studio/data-actions/:actionId/fields"
        element={<ActionFieldsPage />}
      />
      <Route
        path="/data-studio/data-actions/:actionId/fields/:fieldId"
        element={<ActionFieldsPage />}
      />
    </>,
    {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({ databases: [database] }),
      }),
      withRouter: true,
      initialRoute: `/data-studio/data-actions/${action.id}/fields${fieldId ? `/${fieldId}` : ""}`,
    },
  );
}

const DATASET_QUERY = createMockNativeDatasetQuery({
  database: 1,
  native: createMockNativeQuery({
    query: "UPDATE orders SET status = {{status}}",
    "template-tags": {
      status: createMockTemplateTag({
        id: "status",
        name: "status",
        "display-name": "Status",
        type: "text",
      }),
    },
  }),
});

const TWO_VARIABLE_DATASET_QUERY = createMockNativeDatasetQuery({
  database: 1,
  native: createMockNativeQuery({
    query: "UPDATE orders SET status = {{status}} WHERE id = {{id}}",
    "template-tags": {
      status: createMockTemplateTag({
        id: "status",
        name: "status",
        "display-name": "Status",
        type: "text",
      }),
      id: createMockTemplateTag({
        id: "id",
        name: "id",
        "display-name": "ID",
        type: "number",
      }),
    },
  }),
});

describe("ActionFieldsPage", () => {
  it("should let a user who can edit the action change every field setting", async () => {
    setup({
      action: createMockQueryAction({
        database_id: 1,
        dataset_query: DATASET_QUERY,
        can_write: true,
      }),
      database: createMockDatabase({
        id: 1,
        native_permissions: "write",
        settings: { "database-enable-actions": true },
      }),
    });

    expect(await screen.findByLabelText("Display name")).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Number" })).toBeEnabled();
  });

  it("should not let a user who can't edit the action change field settings", async () => {
    setup({
      action: createMockQueryAction({
        database_id: 1,
        dataset_query: DATASET_QUERY,
        can_write: false,
      }),
      database: createMockDatabase({
        id: 1,
        native_permissions: "write",
        settings: { "database-enable-actions": true },
      }),
    });

    expect(await screen.findByLabelText("Display name")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Number" })).toBeDisabled();
  });

  it("should not let a user without native query permissions change the field type", async () => {
    setup({
      action: createMockQueryAction({
        database_id: 1,
        dataset_query: DATASET_QUERY,
        can_write: true,
      }),
      database: createMockDatabase({
        id: 1,
        native_permissions: "none",
        settings: { "database-enable-actions": true },
      }),
    });

    expect(await screen.findByLabelText("Display name")).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Number" })).toBeDisabled();
  });

  it("should not let anyone change the field type when actions are disabled for the database", async () => {
    setup({
      action: createMockQueryAction({
        database_id: 1,
        dataset_query: DATASET_QUERY,
        can_write: true,
      }),
      database: createMockDatabase({
        id: 1,
        native_permissions: "write",
        settings: { "database-enable-actions": false },
      }),
    });

    expect(await screen.findByLabelText("Display name")).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Number" })).toBeDisabled();
  });

  it("should tell a user who can edit the action that fields can be reordered", async () => {
    setup({
      action: createMockQueryAction({
        database_id: 1,
        dataset_query: TWO_VARIABLE_DATASET_QUERY,
        can_write: true,
      }),
      database: createMockDatabase({
        id: 1,
        native_permissions: "write",
        settings: { "database-enable-actions": true },
      }),
    });

    expect(
      await screen.findByText(
        "One field per {{variable}} in the SQL. Drag to reorder the form.",
      ),
    ).toBeInTheDocument();
  });

  it("should not mention reordering to a user who can't edit the action", async () => {
    setup({
      action: createMockQueryAction({
        database_id: 1,
        dataset_query: TWO_VARIABLE_DATASET_QUERY,
        can_write: false,
      }),
      database: createMockDatabase({
        id: 1,
        native_permissions: "write",
        settings: { "database-enable-actions": true },
      }),
    });

    expect(
      await screen.findByText("One field per {{variable}} in the SQL."),
    ).toBeInTheDocument();
  });

  it("asks a user who can edit the action to select a field", async () => {
    setup({
      action: createMockQueryAction({
        database_id: 1,
        dataset_query: DATASET_QUERY,
        can_write: true,
      }),
      database: createMockDatabase({
        id: 1,
        native_permissions: "write",
        settings: { "database-enable-actions": true },
      }),
      fieldId: "",
    });

    expect(
      await screen.findByText("Edit the action's fields"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
  });

  it("asks a user who can't edit the action to select a field to see it", async () => {
    setup({
      action: createMockQueryAction({
        database_id: 1,
        dataset_query: DATASET_QUERY,
        can_write: false,
      }),
      database: createMockDatabase({
        id: 1,
        native_permissions: "write",
        settings: { "database-enable-actions": true },
      }),
      fieldId: "",
    });

    expect(
      await screen.findByText("See the action's fields"),
    ).toBeInTheDocument();
  });
});
