import React from "react";
import _ from "underscore";
import {
  getByRole,
  getByText,
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MetabaseSettings from "metabase/lib/settings";
import Utils from "metabase/lib/utils";

import type { InitialSyncStatus } from "metabase-types/api";

import {
  createMockDatabase,
  COMMON_DATABASE_FEATURES,
} from "metabase-types/api/mocks";
import Database from "metabase-lib/metadata/Database";

import Sidebar from "./Sidebar";

const NOT_SYNCED_DB_STATUSES: InitialSyncStatus[] = ["aborted", "incomplete"];

function getModal() {
  return document.querySelector(".Modal") as HTMLElement;
}

function setup({
  database = createMockDatabase(),
  isAdmin = true,
  isModelPersistenceEnabled = false,
} = {}) {
  // Using mockResolvedValue since `ActionButton` component
  // the Sidebar is using is expecting these callbacks to be async
  const updateDatabase = jest.fn().mockResolvedValue({});
  const syncDatabaseSchema = jest.fn().mockResolvedValue({});
  const rescanDatabaseFields = jest.fn().mockResolvedValue({});
  const discardSavedFieldValues = jest.fn().mockResolvedValue({});
  const dismissSyncSpinner = jest.fn().mockResolvedValue({});
  const deleteDatabase = jest.fn().mockResolvedValue({});

  const utils = render(
    <Sidebar
      database={new Database(database)}
      isAdmin={isAdmin}
      isModelPersistenceEnabled={isModelPersistenceEnabled}
      updateDatabase={updateDatabase}
      syncDatabaseSchema={syncDatabaseSchema}
      rescanDatabaseFields={rescanDatabaseFields}
      discardSavedFieldValues={discardSavedFieldValues}
      dismissSyncSpinner={dismissSyncSpinner}
      deleteDatabase={deleteDatabase}
    />,
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

function mockMetabaseSettings() {
  const original = MetabaseSettings.get.bind(MetabaseSettings);
  const spy = jest.spyOn(MetabaseSettings, "get");
  spy.mockImplementation(key => {
    if (key === "site-uuid") {
      return Utils.uuid();
    }
    return original(key);
  });
}

describe("DatabaseEditApp/Sidebar", () => {
  beforeAll(() => {
    mockMetabaseSettings();
  });

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
      userEvent.click(getByRole(getModal(), "button", { name: "Yes" }));

      expect(discardSavedFieldValues).toHaveBeenCalledWith(database.id);
    });

    it("allows to cancel confirmation modal", async () => {
      const { discardSavedFieldValues } = setup();

      userEvent.click(screen.getByText(/Discard saved field values/i));
      userEvent.click(getByRole(getModal(), "button", { name: "Cancel" }));
      await waitForElementToBeRemoved(() => getModal());

      expect(getModal()).not.toBeInTheDocument();
      expect(discardSavedFieldValues).not.toBeCalled();
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
      userEvent.type(getByRole(modal, "textbox"), database.name);
      userEvent.click(getByRole(modal, "button", { name: "Delete" }));
      await waitForElementToBeRemoved(() => getModal());

      expect(getModal()).not.toBeInTheDocument();
      expect(deleteDatabase).toHaveBeenCalled();
    });

    it("allows to dismiss confirmation modal", async () => {
      const { database, deleteDatabase } = setup({ isAdmin: true });
      userEvent.click(screen.getByText(/Remove this database/i));
      const modal = getModal();

      getByText(modal, `Delete the ${database.name} database?`);
      userEvent.click(getByRole(modal, "button", { name: "Cancel" }));
      await waitForElementToBeRemoved(() => getModal());

      expect(getModal()).not.toBeInTheDocument();
      expect(deleteDatabase).not.toBeCalled();
    });
  });
});
