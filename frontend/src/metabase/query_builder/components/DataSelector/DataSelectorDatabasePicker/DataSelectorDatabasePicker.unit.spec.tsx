import React from "react";
import { render, screen } from "@testing-library/react";

import { createMockDatabase } from "metabase-types/api/mocks/database";

import DataSelectorDatabasePicker from "./DataSelectorDatabasePicker";

const database = createMockDatabase();

const props = {
  onChangeDatabase: jest.fn(),
  onChangeSchema: jest.fn(),
};

describe("DataSelectorDatabasePicker", () => {
  it("displays database name", () => {
    render(<DataSelectorDatabasePicker {...props} databases={[database]} />);

    expect(screen.getByText(database.name)).toBeInTheDocument();
  });
});
