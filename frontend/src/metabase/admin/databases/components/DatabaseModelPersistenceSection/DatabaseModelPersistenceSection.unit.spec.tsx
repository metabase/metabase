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

import { DatabaseModelPersistenceSection } from "./DatabaseModelPersistenceSection";

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
  const dismissSyncSpinner = jest.fn().mockResolvedValue({});
  const deleteDatabase = jest.fn().mockResolvedValue({});

  const utils = renderWithProviders(
    <DatabaseModelPersistenceSection
      database={database}
      isModelPersistenceEnabled={isModelPersistenceEnabled}
    />,
    { storeInitialState: state },
  );

  return {
    ...utils,
    database,
    dismissSyncSpinner,
    deleteDatabase,
  };
}

describe("DatabaseModelPersistenceSection", () => {
  describe("model caching control", () => {
    it("isn't shown if model caching is turned off globally", () => {
      setup({ isModelPersistenceEnabled: false });
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
      expect(screen.getByLabelText("Model persistence")).toBeInTheDocument();
      expect(screen.getByLabelText("Model persistence")).toBeChecked();
    });
  });
});
