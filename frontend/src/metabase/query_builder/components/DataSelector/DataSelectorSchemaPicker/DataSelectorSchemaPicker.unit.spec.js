import React from "react";
import { render, screen } from "@testing-library/react";

import DataSelectorSchemaPicker from "./DataSelectorSchemaPicker";

describe("DataSelectorSchemaPicker", () => {
  it("displays schema name", () => {
    const schemaName = "Schema name";
    const schemas = [{ displayName: () => schemaName }];
    render(<DataSelectorSchemaPicker schemas={schemas} />);

    expect(screen.getByText(schemaName)).toBeInTheDocument();
  });
});
