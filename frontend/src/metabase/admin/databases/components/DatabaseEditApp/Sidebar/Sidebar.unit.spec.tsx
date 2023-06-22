import _ from "underscore";
import userEvent from "@testing-library/user-event";
import { checkNotNull } from "metabase/core/utils/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Database, InitialSyncStatus } from "metabase-types/api";
import {
  createMockDatabase,
  COMMON_DATABASE_FEATURES,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import Sidebar from "./Sidebar";

const NOT_SYNCED_DB_STATUSES: InitialSyncStatus[] = ["aborted", "incomplete"];

function getModal() {
  return document.querySelector(".Modal") as HTMLElement;
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

  // Using mockResolvedValue since `ActionButton` component
  // the Sidebar is using is expecting these callbacks to be async
  const updateDatabase = jest.fn().mockResolvedValue({});
  const syncDatabaseSchema = jest.fn().mockResolvedValue({});
  const rescanDatabaseFields = jest.fn().mockResolvedValue({});
  const discardSavedFieldValues = jest.fn().mockResolvedValue({});
  const dismissSyncSpinner = jest.fn().mockResolvedValue({});
  const deleteDatabase = jest.fn().mockResolvedValue({});

  const utils = renderWithProviders(
    <Sidebar
      database={checkNotNull(metadata.database(database.id))}
      isAdmin={isAdmin}
      isModelPersistenceEnabled={isModelPersistenceEnabled}
      updateDatabase={updateDatabase}
      syncDatabaseSchema={syncDatabaseSchema}
      rescanDatabaseFields={rescanDatabaseFields}
      discardSavedFieldValues={discardSavedFieldValues}
      dismissSyncSpinner={dismissSyncSpinner}
      deleteDatabase={deleteDatabase}
    />,
    { storeInitialState: state },
  );

  return {
    ...utils,
    database,
    updateDatabase,
    syncDatabaseSchema,
    rescanDatabaseFields,
    discardSavedFieldValues,
    dismissSyncSpinner,
    deleteDatabase,
  };
}

describe("DatabaseEditApp/Sidebar", () => {
  it("syncs database schema", () => {
    const { database, syncDatabaseSchema } = setup();
    userEvent.click(screen.getByText(/Sync database schema now/i));
    expect(syncDatabaseSchema).toHaveBeenCalledWith(database.id);
  });

  it("re-scans database field values", () => {
    const { database, rescanDatabaseFields } = setup();
    userEvent.click(screen.getByText(/Re-scan field values now/i));
    expect(rescanDatabaseFields).toHaveBeenCalledWith(database.id);
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

      it(`can be dismissed for a database with "${initial_sync_status}" sync status (#20863)`, () => {
        const database = createMockDatabase({ initial_sync_status });
        const { dismissSyncSpinner } = setup({ database });

        userEvent.click(screen.getByText(/Dismiss sync spinner manually/i));

        expect(dismissSyncSpinner).toHaveBeenCalledWith(database.id);
      });
    });
  });

  describe("discarding field values", () => {
    it("discards field values", () => {
      const { database, discardSavedFieldValues } = setup();

      userEvent.click(screen.getByText(/Discard saved field values/i));
      userEvent.click(within(getModal()).getByRole("button", { name: "Yes" }));

      expect(discardSavedFieldValues).toHaveBeenCalledWith(database.id);
    });

    it("allows to cancel confirmation modal", async () => {
      const { discardSavedFieldValues } = setup();

      userEvent.click(screen.getByText(/Discard saved field values/i));
      userEvent.click(
        within(getModal()).getByRole("button", { name: "Cancel" }),
      );
      await waitForElementToBeRemoved(() => getModal());

      expect(getModal()).not.toBeInTheDocument();
      expect(discardSavedFieldValues).not.toHaveBeenCalled();
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

    it("enables actions", () => {
      const { database, updateDatabase } = setup();

      userEvent.click(screen.getByLabelText(/Model actions/i));

      expect(updateDatabase).toHaveBeenCalledWith({
        id: database.id,
        settings: { "database-enable-actions": true },
      });
    });

    it("disables actions", () => {
      const database = createMockDatabase({
        settings: { "database-enable-actions": true },
      });
      const { updateDatabase } = setup({ database });

      userEvent.click(screen.getByLabelText(/Model actions/i));

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
        screen.queryByText(/Turn model caching on/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Turn model caching off/i),
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
        screen.queryByText(/Turn model caching on/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Turn model caching off/i),
      ).not.toBeInTheDocument();
    });

    it("offers to enable caching when it's enabled on the instance and supported by a database", () => {
      setup({ isModelPersistenceEnabled: true });
      expect(screen.getByText(/Turn model caching on/i)).toBeInTheDocument();
      expect(
        screen.queryByText(/Turn model caching off/i),
      ).not.toBeInTheDocument();
    });

    it("offers to disable caching when it's enabled for a database", () => {
      setup({
        isModelPersistenceEnabled: true,
        database: createMockDatabase({
          features: [...COMMON_DATABASE_FEATURES, "persist-models-enabled"],
        }),
      });
      expect(screen.getByText(/Turn model caching off/i)).toBeInTheDocument();
      expect(
        screen.queryByText(/Turn model caching on/i),
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
      userEvent.click(screen.getByText(/Remove this database/i));
      const modal = getModal();

      // Fill in database name to confirm deletion
      userEvent.type(await within(modal).findByRole("textbox"), database.name);
      userEvent.click(within(modal).getByRole("button", { name: "Delete" }));
      await waitForElementToBeRemoved(() => getModal());

      expect(getModal()).not.toBeInTheDocument();
      expect(deleteDatabase).toHaveBeenCalled();
    });

    it("allows to dismiss confirmation modal", async () => {
      const { database, deleteDatabase } = setup({ isAdmin: true });
      userEvent.click(screen.getByText(/Remove this database/i));
      const modal = getModal();

      within(modal).getByText(`Delete the ${database.name} database?`);
      userEvent.click(
        await within(modal).findByRole("button", { name: "Cancel" }),
      );
      await waitForElementToBeRemoved(() => getModal());

      expect(getModal()).not.toBeInTheDocument();
      expect(deleteDatabase).not.toHaveBeenCalled();
    });
  });
});
