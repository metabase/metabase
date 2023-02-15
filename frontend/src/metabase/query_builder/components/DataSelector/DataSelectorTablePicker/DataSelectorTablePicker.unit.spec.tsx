import React from "react";
import { render, screen } from "@testing-library/react";

import { createMockDatabase } from "metabase-types/api/mocks/database";

import type Table from "metabase-lib/metadata/Table";
import DataSelectorTablePicker from "./DataSelectorTablePicker";

const database = createMockDatabase();

const props = {
  schemas: [],
  onChangeTable: jest.fn(),
};

describe("DataSelectorTablePicker", () => {
  it("when no table is in database", () => {
    render(
      <DataSelectorTablePicker
        {...props}
        selectedDatabase={database}
        tables={[]}
      />,
    );

    expect(
      screen.getByText("No tables found in this database."),
    ).toBeInTheDocument();

    expect(screen.getByText(database.name)).toBeInTheDocument();
  });

  it("when tables are passed", () => {
    const tableName = "Table Name";
    const table = { displayName: () => tableName };

    render(
      <DataSelectorTablePicker
        {...props}
        selectedDatabase={database}
        tables={[table] as Table[]}
      />,
    );

    expect(screen.getByText(database.name)).toBeInTheDocument();
    expect(screen.getByText(tableName)).toBeInTheDocument();
  });
});
