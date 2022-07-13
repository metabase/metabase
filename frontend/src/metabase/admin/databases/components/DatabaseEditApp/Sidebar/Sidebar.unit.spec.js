import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Sidebar from "./Sidebar";

it("syncs database schema", () => {
  const databaseId = 1;
  const database = {
    id: databaseId,
    initial_sync_status: "complete",
    supportsPersistence: () => true,
    isPersisted: () => false,
  };
  const syncDatabaseSchema = jest.fn();

  render(
    <Sidebar database={database} syncDatabaseSchema={syncDatabaseSchema} />,
  );

  const syncButton = screen.getByText("Sync database schema now");

  fireEvent.click(syncButton);

  expect(syncDatabaseSchema).toHaveBeenCalledWith(databaseId);
});

it("rescans database field values", () => {
  const databaseId = 1;
  const database = {
    id: databaseId,
    initial_sync_status: "complete",
    supportsPersistence: () => true,
    isPersisted: () => false,
  };
  const rescanDatabaseFields = jest.fn();

  render(
    <Sidebar database={database} rescanDatabaseFields={rescanDatabaseFields} />,
  );

  const rescanButton = screen.getByText("Re-scan field values now");

  fireEvent.click(rescanButton);

  expect(rescanDatabaseFields).toHaveBeenCalledWith(databaseId);
});

it("can cancel sync and just forgets about initial sync (#20863)", () => {
  const databaseId = 1;
  const database = {
    id: databaseId,
    initial_sync_status: "incomplete",
    supportsPersistence: () => true,
    isPersisted: () => false,
  };
  const dismissSyncSpinner = jest.fn();

  render(
    <Sidebar database={database} dismissSyncSpinner={dismissSyncSpinner} />,
  );

  const dismissButton = screen.getByText("Dismiss sync spinner manually");
  fireEvent.click(dismissButton);
  expect(dismissSyncSpinner).toHaveBeenCalledWith(databaseId);
});

it("discards saved field values", () => {
  const databaseId = 1;
  const database = {
    id: databaseId,
    initial_sync_status: "complete",
    supportsPersistence: () => true,
    isPersisted: () => false,
  };
  const discardSavedFieldValues = jest.fn();

  render(
    <Sidebar
      database={database}
      discardSavedFieldValues={discardSavedFieldValues}
    />,
  );

  const discardButton = screen.getByText("Discard saved field values");

  fireEvent.click(discardButton);

  expect(screen.getAllByText("Discard saved field values").length).toBe(2);

  const cancelButton = screen.getByText("Cancel");

  fireEvent.click(cancelButton);

  fireEvent.click(discardButton);

  const yesButton = screen.getByText("Yes");

  fireEvent.click(yesButton);

  expect(discardSavedFieldValues).toHaveBeenCalledWith(databaseId);
});

it("removes database", () => {
  const databaseId = 1;
  const name = "DB Name";
  const database = {
    id: databaseId,
    name,
    supportsPersistence: () => true,
    isPersisted: () => false,
  };
  const deleteDatabase = jest.fn();

  render(
    <Sidebar database={database} deleteDatabase={deleteDatabase} isAdmin />,
  );

  const removeDBButton = screen.getByText("Remove this database");

  fireEvent.click(removeDBButton);

  screen.getByText(`Delete the ${name} database?`);

  const cancelButton = screen.getByText("Cancel");

  fireEvent.click(cancelButton);

  fireEvent.click(removeDBButton);

  const input = screen.getByRole("textbox");

  userEvent.type(input, name);

  const deleteButton = screen.getByText("Delete");

  fireEvent.click(deleteButton);

  expect(deleteDatabase).toHaveBeenCalled();
});

it("does not allow to remove databases for non-admins", () => {
  const database = { id: 1, name: "DB Name" };
  render(<Sidebar database={database} deleteDatabase={jest.fn()} />);
  expect(screen.queryByText("Remove this database")).toBeNull();
});

it("shows loading indicator when a sync is in progress", () => {
  const databaseId = 1;
  const database = {
    id: databaseId,
    initial_sync_status: "incomplete",
    supportsPersistence: () => true,
    isPersisted: () => false,
  };

  render(<Sidebar database={database} />);

  const statusButton = screen.getByText("Syncing database…");
  expect(statusButton).toBeInTheDocument();
});
