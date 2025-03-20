import userEvent from "@testing-library/user-event";
import _ from "underscore";

import {
  setupDatabaseEndpoints,
  setupDatabaseUsageInfoEndpoint,
} from "__support__/server-mocks/database";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Database } from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockDatabase,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DatabaseModelFeaturesSection } from "./DatabaseModelFeaturesSection";

interface SetupOpts {
  database?: Database;
  isModelPersistenceEnabled?: boolean;
}

function setup({
  database = createMockDatabase(),
  isModelPersistenceEnabled = false,
}: SetupOpts = {}) {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });
  const metadata = getMetadata(state);
  setupDatabaseEndpoints(database);
  setupDatabaseUsageInfoEndpoint(database, {
    question: 0,
    dataset: 0,
    metric: 0,
    segment: 0,
  });

  // Using mockResolvedValue since `ActionButton` component
  // the Sidebar is using is expecting these callbacks to be async
  const updateDatabase = jest.fn().mockResolvedValue({});
  const dismissSyncSpinner = jest.fn().mockResolvedValue({});
  const deleteDatabase = jest.fn().mockResolvedValue({});

  const utils = renderWithProviders(
    <DatabaseModelFeaturesSection
      database={checkNotNull(metadata.database(database.id))}
      isModelPersistenceEnabled={isModelPersistenceEnabled}
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

describe("DatabaseModelFeaturesSection", () => {
  describe("model actions control", () => {
    it("is shown if database supports actions", () => {
      setup();

      expect(screen.getByLabelText(/Model actions/i)).toBeInTheDocument();
    });

    it("isn't shown if database doesn't support actions", () => {
      const features = _.without(COMMON_DATABASE_FEATURES, "actions");
      setup({ database: createMockDatabase({ features }) });

      expect(screen.queryByText(/Model actions/i)).not.toBeInTheDocument();
    });

    it("shows if actions are enabled", () => {
      setup({
        database: createMockDatabase({
          settings: { "database-enable-actions": true },
        }),
      });

      expect(screen.getByLabelText(/Model actions/i)).toBeChecked();
    });

    it("shows if actions are disabled", () => {
      setup({
        database: createMockDatabase({
          settings: { "database-enable-actions": false },
        }),
      });

      expect(screen.getByLabelText(/Model actions/i)).not.toBeChecked();
    });

    it("enables actions", async () => {
      const { database, updateDatabase } = setup();

      await userEvent.click(screen.getByLabelText(/Model actions/i));

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

      await userEvent.click(screen.getByLabelText(/Model actions/i));

      expect(updateDatabase).toHaveBeenCalledWith({
        id: database.id,
        settings: { "database-enable-actions": false },
      });
    });
  });

  describe("model caching control", () => {
    it("isn't shown if model caching is turned off globally", () => {
      setup({ isModelPersistenceEnabled: false });
      expect(screen.getByLabelText("Model actions")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Model persistence"),
      ).not.toBeInTheDocument();
    });

    it("isn't shown if database doesn't support model caching", () => {
      setup({
        isModelPersistenceEnabled: true,
        database: createMockDatabase({
          features: _.without(COMMON_DATABASE_FEATURES, "persist-models"),
        }),
      });
      expect(screen.getByLabelText("Model actions")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Model persistence"),
      ).not.toBeInTheDocument();
    });

    it("offers to enable caching when it's enabled on the instance and supported by a database", () => {
      setup({ isModelPersistenceEnabled: true });
      expect(screen.getByLabelText("Model persistence")).toBeInTheDocument();
      expect(screen.getByLabelText("Model persistence")).not.toBeChecked();
    });

    it("offers to disable caching when it's enabled for a database", () => {
      setup({
        isModelPersistenceEnabled: true,
        database: createMockDatabase({
          features: [...COMMON_DATABASE_FEATURES, "persist-models-enabled"],
        }),
      });
      expect(screen.getByLabelText("Model actions")).toBeInTheDocument();
      expect(screen.getByLabelText("Model persistence")).toBeInTheDocument();
      expect(screen.getByLabelText("Model persistence")).toBeChecked();
    });
  });
});
