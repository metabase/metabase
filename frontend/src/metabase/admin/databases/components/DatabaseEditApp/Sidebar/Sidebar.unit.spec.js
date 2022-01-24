import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Sidebar from "./Sidebar";

it("syncs database schema", () => {
  const databaseId = 1;
  const database = { id: databaseId, initial_sync_status: "complete" };
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
  const database = { id: databaseId, initial_sync_status: "complete" };
  const rescanDatabaseFields = jest.fn();

  render(
    <Sidebar database={database} rescanDatabaseFields={rescanDatabaseFields} />,
  );

  const rescanButton = screen.getByText("Re-scan field values now");

  fireEvent.click(rescanButton);

  expect(rescanDatabaseFields).toHaveBeenCalledWith(databaseId);
});

it("discards saved field values", () => {
  const databaseId = 1;
  const database = { id: databaseId, initial_sync_status: "complete" };
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
  const database = { id: databaseId, name };
  const deleteDatabase = jest.fn();

  render(<Sidebar database={database} deleteDatabase={deleteDatabase} />);

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

it("hides syncing actions until the initial sync", () => {
  const databaseId = 1;
  const database = { id: databaseId, initial_sync_status: "incomplete" };

  render(<Sidebar database={database} />);

  const statusButton = screen.getByText("Syncing database…");
  const syncButton = screen.queryByText("Sync database schema now");
  const rescanButton = screen.queryByText("Re-scan field values now");
  const discardButton = screen.queryByText("Discard saved field values");

  expect(statusButton).toBeInTheDocument();
  expect(syncButton).not.toBeInTheDocument();
  expect(rescanButton).not.toBeInTheDocument();
  expect(discardButton).not.toBeInTheDocument();
});
