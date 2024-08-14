import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import _ from "underscore";

import {
  setupDatabaseEndpoints,
  setupDatabaseUsageInfoEndpoint,
} from "__support__/server-mocks/database";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Database, InitialSyncStatus } from "metabase-types/api";
import {
  createMockDatabase,
  COMMON_DATABASE_FEATURES,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import Sidebar from "./Sidebar";

const NOT_SYNCED_DB_STATUSES: InitialSyncStatus[] = ["aborted", "incomplete"];

function getModal() {
  return document.querySelector("[data-testid=modal]") as HTMLElement;
}

interface SetupOpts {
  database?: Database;
  isAdmin?: boolean;
  isModelPersistenceEnabled?: boolean;
}

function setup({
  database = createMockDatabase(),
  isAdmin = true,
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
    <Sidebar
      database={checkNotNull(metadata.database(database.id))}
      isAdmin={isAdmin}
      isModelPersistenceEnabled={isModelPersistenceEnabled}
      updateDatabase={updateDatabase}
      dismissSyncSpinner={dismissSyncSpinner}
      deleteDatabase={deleteDatabase}
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

describe("DatabaseEditApp/Sidebar", () => {
  it("syncs database schema", async () => {
    const { database } = setup();
    await userEvent.click(screen.getByText(/Sync database schema now/i));
    await waitFor(() => {
      expect(
        fetchMock.called(`path:/api/database/${database.id}/sync_schema`),
      ).toBe(true);
    });
  });

  it("re-scans database field values", async () => {
    const { database } = setup();
    await userEvent.click(screen.getByText(/Re-scan field values now/i));
    await waitFor(() => {
      expect(
        fetchMock.called(`path:/api/database/${database.id}/rescan_values`),
      ).toBe(true);
    });
  });

  describe("sync indicator", () => {
    it("isn't shown for a fully synced database", () => {
      setup({
        database: createMockDatabase({ initial_sync_status: "complete" }),
      });

      expect(screen.queryByText(/Syncing database…/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Dismiss sync spinner manually/i),
      ).not.toBeInTheDocument();
    });

    NOT_SYNCED_DB_STATUSES.forEach(initial_sync_status => {
      it(`is shown for a database with "${initial_sync_status}" sync status`, () => {
        setup({ database: createMockDatabase({ initial_sync_status }) });

        expect(screen.getByText(/Syncing database…/i)).toBeInTheDocument();
        expect(
          screen.getByText(/Dismiss sync spinner manually/i),
        ).toBeInTheDocument();
      });

      it(`can be dismissed for a database with "${initial_sync_status}" sync status (#20863)`, async () => {
        const database = createMockDatabase({ initial_sync_status });
        const { dismissSyncSpinner } = setup({ database });

        await userEvent.click(
          screen.getByText(/Dismiss sync spinner manually/i),
        );

        expect(dismissSyncSpinner).toHaveBeenCalledWith(database.id);
      });
    });
  });

  describe("discarding field values", () => {
    it("discards field values", async () => {
      const { database } = setup();

      await userEvent.click(screen.getByText(/Discard saved field values/i));
      await userEvent.click(
        within(getModal()).getByRole("button", { name: "Yes" }),
      );

      await waitFor(() => {
        expect(
          fetchMock.called(`path:/api/database/${database.id}/discard_values`),
        ).toBe(true);
      });
    });

    it("allows to cancel confirmation modal", async () => {
      const { database } = setup();

      await userEvent.click(screen.getByText(/Discard saved field values/i));
      await userEvent.click(
        within(getModal()).getByRole("button", { name: "Cancel" }),
      );

      expect(getModal()).not.toBeInTheDocument();
      expect(
        fetchMock.called(`path:/api/database/${database.id}/discard_values`),
      ).toBe(false);
    });

    NOT_SYNCED_DB_STATUSES.forEach(initial_sync_status => {
      it(`is hidden for databases with "${initial_sync_status}" sync status`, () => {
        setup({
          database: createMockDatabase({ initial_sync_status }),
        });

        expect(
          screen.queryByText(/Discard saved field values/i),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("model actions control", () => {
    it("is shown if database supports actions", () => {
      setup();
      expect(screen.getByLabelText(/Model actions/i)).toBeInTheDocument();
    });

    it("is shown for non-admin users", () => {
      setup({ isAdmin: false });
      expect(screen.getByLabelText(/Model actions/i)).toBeInTheDocument();
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

    it("isn't shown if database doesn't support actions", () => {
      const features = _.without(COMMON_DATABASE_FEATURES, "actions");
      setup({ database: createMockDatabase({ features }) });

      expect(screen.queryByText(/Model actions/i)).not.toBeInTheDocument();
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

      expect(
        screen.queryByText(/Turn model persistence on/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Turn model persistence off/i),
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
        screen.queryByText(/Turn model persistence on/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Turn model persistence off/i),
      ).not.toBeInTheDocument();
    });

    it("offers to enable caching when it's enabled on the instance and supported by a database", () => {
      setup({ isModelPersistenceEnabled: true });
      expect(
        screen.getByText(/Turn model persistence on/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/Turn model persistence off/i),
      ).not.toBeInTheDocument();
    });

    it("offers to disable caching when it's enabled for a database", () => {
      setup({
        isModelPersistenceEnabled: true,
        database: createMockDatabase({
          features: [...COMMON_DATABASE_FEATURES, "persist-models-enabled"],
        }),
      });
      expect(
        screen.getByText(/Turn model persistence off/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/Turn model persistence on/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("database removal", () => {
    it("isn't shown for non-admins", () => {
      setup({ isAdmin: false });
      expect(
        screen.queryByText(/Remove this database/i),
      ).not.toBeInTheDocument();
    });

    it("removes database", async () => {
      const { database, deleteDatabase } = setup({ isAdmin: true });
      await userEvent.click(screen.getByText(/Remove this database/i));
      const modal = getModal();

      // Fill in database name to confirm deletion
      await userEvent.type(
        await within(modal).findByRole("textbox"),
        database.name,
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Delete" }),
      );
      await waitFor(() => {
        expect(getModal()).not.toBeInTheDocument();
      });

      expect(getModal()).not.toBeInTheDocument();
      expect(deleteDatabase).toHaveBeenCalled();
    });

    it("allows to dismiss confirmation modal", async () => {
      const { database, deleteDatabase } = setup({ isAdmin: true });
      await userEvent.click(screen.getByText(/Remove this database/i));
      const modal = getModal();

      within(modal).getByText(`Delete the ${database.name} database?`);
      await userEvent.click(
        await within(modal).findByRole("button", { name: "Cancel" }),
      );

      expect(getModal()).not.toBeInTheDocument();
      expect(deleteDatabase).not.toHaveBeenCalled();
    });
  });
});
