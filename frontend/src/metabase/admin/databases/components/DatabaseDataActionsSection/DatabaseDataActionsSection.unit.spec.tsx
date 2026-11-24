import userEvent from "@testing-library/user-event";
import _ from "underscore";

import {
  setupDatabaseEndpoints,
  setupDatabaseUsageInfoEndpoint,
} from "__support__/server-mocks/database";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { DatabaseDataActionsSection } from "./DatabaseDataActionsSection";

interface SetupOpts {
  database?: Database;
}

function setup({ database = createMockDatabase() }: SetupOpts = {}) {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });
  setupDatabaseEndpoints(database);
  setupDatabaseUsageInfoEndpoint(database, {
    question: 0,
    dataset: 0,
    metric: 0,
    segment: 0,
    transform: 0,
  });

  // Using mockResolvedValue since `ActionButton` component
  // the Sidebar is using is expecting these callbacks to be async
  const updateDatabase = jest.fn().mockResolvedValue({});
  const dismissSyncSpinner = jest.fn().mockResolvedValue({});
  const deleteDatabase = jest.fn().mockResolvedValue({});

  const utils = renderWithProviders(
    <DatabaseDataActionsSection
      database={database}
      updateDatabase={updateDatabase}
    />,
    { storeInitialState: state },
  );

  return {
    ...utils,
    database,
    updateDatabase,
    dismissSyncSpinner,
    deleteDatabase,
  };
}

describe("DatabaseDataActionsSection", () => {
  describe("data actions control", () => {
    it("is shown if database supports actions", () => {
      setup();

      expect(screen.getByLabelText(/Data actions/i)).toBeInTheDocument();
    });

    it("isn't shown if database doesn't support actions", () => {
      const features = _.without(COMMON_DATABASE_FEATURES, "actions");
      setup({ database: createMockDatabase({ features }) });

      expect(screen.queryByText(/Data actions/i)).not.toBeInTheDocument();
    });

    it("shows if actions are enabled", () => {
      setup({
        database: createMockDatabase({
          settings: { "database-enable-actions": true },
        }),
      });

      expect(screen.getByLabelText(/Data actions/i)).toBeChecked();
    });

    it("shows if actions are disabled", () => {
      setup({
        database: createMockDatabase({
          settings: { "database-enable-actions": false },
        }),
      });

      expect(screen.getByLabelText(/Data actions/i)).not.toBeChecked();
    });

    it("enables actions", async () => {
      const { database, updateDatabase } = setup();

      await userEvent.click(screen.getByLabelText(/Data actions/i));

      expect(updateDatabase).toHaveBeenCalledWith({
        id: database.id,
        settings: { "database-enable-actions": true },
      });
    });

    it("disables actions", async () => {
      const database = createMockDatabase({
        settings: { "database-enable-actions": true },
      });
      const { updateDatabase } = setup({ database });

      await userEvent.click(screen.getByLabelText(/Data actions/i));

      expect(updateDatabase).toHaveBeenCalledWith({
        id: database.id,
        settings: { "database-enable-actions": false },
      });
    });
  });
});
