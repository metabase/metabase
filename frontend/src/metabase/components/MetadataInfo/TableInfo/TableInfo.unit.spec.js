import React from "react";
import { render, screen } from "@testing-library/react";

import { PRODUCTS } from "__support__/sample_dataset_fixture";
import Table from "metabase-lib/lib/metadata/Table";

import TableInfo from "./TableInfo";

const table = new Table(PRODUCTS);
const tableNoDescription = new Table({ id: 123, display_name: "Foo" });

describe("TableInfo", () => {
  beforeEach(() => {
    render(<TableInfo table={table} />);
  });

  it("should display the given table's name", () => {
    expect(screen.getByText(PRODUCTS.display_name)).toBeInTheDocument();
  });

  it("should display the given table's description", () => {
    expect(screen.getByText(PRODUCTS.description)).toBeInTheDocument();
  });

  it("should display a placeholder if table has no description", () => {
    render(<TableInfo table={tableNoDescription} />);

    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});
