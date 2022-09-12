import React from "react";
import { render, screen } from "@testing-library/react";

import DataSelectorDatabasePicker from "./DataSelectorDatabasePicker";

describe("DataSelectorDatabasePicker", () => {
  it("displays database name", () => {
    const databaseName = "Database name";

    const databases = [
      {
        id: 1,
        name: databaseName,
      },
    ];

    render(<DataSelectorDatabasePicker databases={databases} />);

    expect(screen.getByText(databaseName)).toBeInTheDocument();
  });
});
