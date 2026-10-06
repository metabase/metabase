import {
  setupActionEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { Database, User, WritebackQueryAction } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockQueryAction,
  createMockUser,
} from "metabase-types/api/mocks";

import { ActionSettingsPage } from "./ActionSettingsPage";

type SetupOpts = {
  action: WritebackQueryAction;
  database: Database;
  user: User;
};

function setup({ action, database, user }: SetupOpts) {
  setupActionEndpoints(action);
  setupDatabaseEndpoints(database);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });

  renderWithProviders(
    <Route
      path="/data-studio/data-actions/:actionId/settings"
      element={<ActionSettingsPage />}
    />,
    {
      storeInitialState: createMockState({
        currentUser: user,
        settings: mockSettings({ "enable-public-sharing": true }),
      }),
      withRouter: true,
      initialRoute: `/data-studio/data-actions/${action.id}/settings`,
    },
  );
}

describe("ActionSettingsPage", () => {
  describe("success message", () => {
    it("should be editable when the user can edit the action", async () => {
      setup({
        action: createMockQueryAction({ database_id: 1, can_write: true }),
        database: createMockDatabase({ id: 1 }),
        user: createMockUser({ is_superuser: true }),
      });

      const input = await screen.findByLabelText("Message");
      expect(input).not.toHaveAttribute("readonly");
    });

    it("should be read-only when the user can't edit the action", async () => {
      setup({
        action: createMockQueryAction({ database_id: 1, can_write: false }),
        database: createMockDatabase({ id: 1 }),
        user: createMockUser({ is_superuser: false }),
      });

      const input = await screen.findByLabelText("Message");
      expect(input).toHaveAttribute("readonly");
    });
  });

  describe("public sharing", () => {
    it("should not be shown to non-admins", async () => {
      setup({
        action: createMockQueryAction({ database_id: 1, can_write: true }),
        database: createMockDatabase({
          id: 1,
          settings: { "database-enable-actions": true },
        }),
        user: createMockUser({ is_superuser: false }),
      });

      expect(await screen.findByLabelText("Message")).toBeInTheDocument();
      expect(screen.queryByText("Public sharing")).not.toBeInTheDocument();
    });

    it("should let admins make the action public when actions are enabled for its database", async () => {
      setup({
        action: createMockQueryAction({
          database_id: 1,
          can_write: true,
          public_uuid: null,
        }),
        database: createMockDatabase({
          id: 1,
          settings: { "database-enable-actions": true },
        }),
        user: createMockUser({ is_superuser: true }),
      });

      expect(await screen.findByLabelText("Make public")).toBeEnabled();
    });

    it("should not let admins make the action public when actions are disabled for its database", async () => {
      setup({
        action: createMockQueryAction({
          database_id: 1,
          can_write: true,
          public_uuid: null,
        }),
        database: createMockDatabase({
          id: 1,
          settings: { "database-enable-actions": false },
        }),
        user: createMockUser({ is_superuser: true }),
      });

      expect(await screen.findByLabelText("Make public")).toBeDisabled();
    });

    it("should let admins remove the public link when actions are disabled for its database", async () => {
      setup({
        action: createMockQueryAction({
          database_id: 1,
          can_write: true,
          public_uuid: "a8b6c4f2-1d3e-4f5a-9b7c-2e1d0f9a8b7c",
        }),
        database: createMockDatabase({
          id: 1,
          settings: { "database-enable-actions": false },
        }),
        user: createMockUser({ is_superuser: true }),
      });

      expect(await screen.findByLabelText("Make public")).toBeEnabled();
      expect(
        screen.getByLabelText("Public action form URL"),
      ).toBeInTheDocument();
    });
  });
});
