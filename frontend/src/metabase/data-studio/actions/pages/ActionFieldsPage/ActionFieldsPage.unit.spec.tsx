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
};

function setup({ action, database }: SetupOpts) {
  setupActionEndpoints(action);
  setupDatabaseListEndpoint([database]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });

  renderWithProviders(
    <Route
      path="/data-studio/data-actions/:actionId/fields/:fieldId"
      element={<ActionFieldsPage />}
    />,
    {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({ databases: [database] }),
      }),
      withRouter: true,
      initialRoute: `/data-studio/data-actions/${action.id}/fields/status`,
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

    expect(await screen.findByLabelText("Display name")).not.toHaveAttribute(
      "readonly",
    );
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

    expect(await screen.findByLabelText("Display name")).toHaveAttribute(
      "readonly",
    );
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

    expect(await screen.findByLabelText("Display name")).not.toHaveAttribute(
      "readonly",
    );
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

    expect(await screen.findByLabelText("Display name")).not.toHaveAttribute(
      "readonly",
    );
    expect(screen.getByRole("radio", { name: "Number" })).toBeDisabled();
  });
});
