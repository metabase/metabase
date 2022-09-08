import React from "react";
import { render, screen } from "@testing-library/react";

import DataSelectorTablePicker from "./DataSelectorTablePicker";

const databaseName = "Database name";
const selectedDatabase = { name: databaseName };

describe("DataSelectorTablePicker", () => {
  it("when no table is in database", () => {
    render(
      <DataSelectorTablePicker
        selectedDatabase={selectedDatabase}
        tables={[]}
      />,
    );

    expect(
      screen.getByText("No tables found in this database."),
    ).toBeInTheDocument();

    expect(screen.getByText(databaseName)).toBeInTheDocument();
  });

  it("when tables are passed", () => {
    const tableName = "Table name";
    const tables = [
      {
        id: 1,
        name: "Orders",
        initial_sync_status: "complete",
        displayName: () => tableName,
      },
    ];

    render(
      <DataSelectorTablePicker
        selectedDatabase={selectedDatabase}
        tables={tables}
      />,
    );

    expect(screen.getByText(databaseName)).toBeInTheDocument();
    expect(screen.getByText(tableName)).toBeInTheDocument();
  });
});
