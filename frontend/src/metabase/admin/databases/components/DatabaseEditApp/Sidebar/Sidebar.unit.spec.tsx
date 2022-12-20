import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockDatabase } from "metabase-types/api/mocks";
import Database from "metabase-lib/metadata/Database";

import Sidebar from "./Sidebar";

function setup({
  database = createMockDatabase(),
  isAdmin = true,
  isModelPersistenceEnabled = false,
} = {}) {
  const updateDatabase = jest.fn();
  const syncDatabaseSchema = jest.fn();
  const rescanDatabaseFields = jest.fn();
  const discardSavedFieldValues = jest.fn();
  const dismissSyncSpinner = jest.fn();
  const deleteDatabase = jest.fn();

  render(
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

  it("can cancel sync and just forgets about initial sync (#20863)", () => {
    const database = createMockDatabase({ initial_sync_status: "incomplete" });
    const { dismissSyncSpinner } = setup({ database });

    userEvent.click(screen.getByText(/Dismiss sync spinner manually/i));

    expect(dismissSyncSpinner).toHaveBeenCalledWith(database.id);
  });

  it("discards saved field values", () => {
    const { database, discardSavedFieldValues } = setup();
    const discardButton = screen.getByText(/Discard saved field values/i);

    userEvent.click(discardButton);
    expect(screen.getAllByText(/Discard saved field values/i).length).toBe(2);

    userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    userEvent.click(discardButton);
    userEvent.click(screen.getByRole("button", { name: "Yes" }));

    expect(discardSavedFieldValues).toHaveBeenCalledWith(database.id);
  });

  it("removes database", () => {
    const { database, deleteDatabase } = setup({ isAdmin: true });

    userEvent.click(screen.getByText(/Remove this database/i));
    screen.getByText(`Delete the ${database.name} database?`);
    userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    userEvent.type(screen.getByRole("textbox"), database.name);
    userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteDatabase).toHaveBeenCalled();
  });

  it("does not allow to remove databases for non-admins", () => {
    setup({ isAdmin: false });
    expect(screen.queryByText(/Remove this database/i)).not.toBeInTheDocument();
  });

  it("shows loading indicator when a sync is in progress", () => {
    setup({
      database: createMockDatabase({ initial_sync_status: "incomplete" }),
    });
    expect(screen.getByText("Syncing database…")).toBeInTheDocument();
  });
});
