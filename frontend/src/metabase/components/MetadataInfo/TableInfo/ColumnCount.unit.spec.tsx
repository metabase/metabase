import React from "react";
import { render, screen } from "@testing-library/react";

import Table from "metabase-lib/lib/metadata/Table";

import ColumnCount from "./ColumnCount";

function setup(table: Table) {
  return render(<ColumnCount table={table} />);
}

describe("ColumnCount", () => {
  it("should show a non-plural label for a table with a single field", () => {
    const table = new Table({ fields: [{}] });
    setup(table);

    expect(screen.getByText("1 column")).toBeInTheDocument();
  });

  it("should show a plural label for a table with multiple fields", () => {
    const table = new Table({ fields: [{}, {}] });
    setup(table);

    expect(screen.getByText("2 columns")).toBeInTheDocument();
  });

  it("should handle a scenario where a table has no fields property", () => {
    const table = new Table({ id: 123, display_name: "Foo" });
    setup(table);

    expect(screen.getByText("0 columns")).toBeInTheDocument();
  });
});
