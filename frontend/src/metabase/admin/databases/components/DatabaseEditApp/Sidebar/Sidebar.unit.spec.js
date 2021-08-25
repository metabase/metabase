import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import Sidebar from "./Sidebar";

it("sanity check", () => {
  render(<Sidebar database={{}} />);

  screen.getByText("Actions");
  screen.getByText("Discard saved field values");
  screen.getByText("Remove this database");
});

it("triggers syncing database schema", () => {
  const databaseId = 1;
  const database = { id: databaseId };
  const syncDatabaseSchema = jest.fn();

  render(
    <Sidebar database={database} syncDatabaseSchema={syncDatabaseSchema} />,
  );

  const syncButton = screen.getByText("Sync database schema now");

  fireEvent.click(syncButton);

  expect(syncDatabaseSchema).toHaveBeenCalledWith(databaseId);
});
