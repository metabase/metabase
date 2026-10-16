import {
  setupActionEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { Database, WritebackQueryAction } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { ActionRunPage } from "./ActionRunPage";

type SetupOpts = {
  action: WritebackQueryAction;
  database: Database;
};

function setup({ action, database }: SetupOpts) {
  setupActionEndpoints(action);
  setupDatabasesEndpoints([database]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });

  renderWithProviders(
    <Route
      path="/data-studio/data-actions/:actionId/run"
      element={<ActionRunPage />}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/data-actions/${action.id}/run`,
    },
  );
}

describe("ActionRunPage", () => {
  it("should enable Run when actions are enabled for the action's database", async () => {
    setup({
      action: createMockQueryAction({ database_id: 1, can_write: true }),
      database: createMockDatabase({
        id: 1,
        settings: { "database-enable-actions": true },
      }),
    });

    expect(await screen.findByRole("button", { name: /Run/ })).toBeEnabled();
  });

  it("should disable Run when actions are disabled for the action's database", async () => {
    setup({
      action: createMockQueryAction({ database_id: 1, can_write: true }),
      database: createMockDatabase({
        id: 1,
        settings: { "database-enable-actions": false },
      }),
    });

    expect(await screen.findByRole("button", { name: /Run/ })).toBeDisabled();
  });

  it("should disable Run when the user can't see the action's database", async () => {
    setup({
      action: createMockQueryAction({ database_id: 1, can_write: true }),
      database: createMockDatabase({
        id: 2,
        settings: { "database-enable-actions": true },
      }),
    });

    expect(await screen.findByRole("button", { name: /Run/ })).toBeDisabled();
  });

  it("should enable Run for a user who can't edit the action", async () => {
    setup({
      action: createMockQueryAction({ database_id: 1, can_write: false }),
      database: createMockDatabase({
        id: 1,
        settings: { "database-enable-actions": true },
      }),
    });

    expect(await screen.findByRole("button", { name: /Run/ })).toBeEnabled();
  });
});
