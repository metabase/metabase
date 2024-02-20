import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import type * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";

import { QueryColumnPicker } from "./QueryColumnPicker";

interface TestProps {
  query: Lib.Query;
  stageIndex: number;
}

function Test({ query: initialQuery, stageIndex }: TestProps) {
  const [query, setQuery] = useState(initialQuery);

  return (
    <QueryColumnPicker
      query={query}
      stageIndex={stageIndex}
      onChange={setQuery}
    />
  );
}

type SetupOpts = {
  query?: Lib.Query;
  stageIndex?: number;
};

function setup({ query = createQuery(), stageIndex = -1 }: SetupOpts = {}) {
  renderWithProviders(<Test query={query} stageIndex={stageIndex} />);
}

describe("QueryColumnPicker", () => {
  it("should allow to add and remove a column", () => {
    setup();
    const taxColumn = screen.getByRole("checkbox", { name: "Tax" });
    const totalColumn = screen.getByRole("checkbox", { name: "Total" });
    expect(taxColumn).toBeChecked();
    expect(totalColumn).toBeChecked();

    userEvent.click(taxColumn);
    expect(taxColumn).not.toBeChecked();
    expect(totalColumn).toBeChecked();

    userEvent.click(totalColumn);
    expect(taxColumn).not.toBeChecked();
    expect(totalColumn).not.toBeChecked();

    userEvent.click(taxColumn);
    expect(taxColumn).toBeChecked();
    expect(totalColumn).not.toBeChecked();

    userEvent.click(totalColumn);
    expect(taxColumn).toBeChecked();
    expect(totalColumn).toBeChecked();
  });

  it("should allow to add and remove an implicitly joinable column", () => {
    setup();
    const categoryColumn = screen.getByRole("checkbox", { name: "Category" });
    const vendorColumn = screen.getByRole("checkbox", { name: "Vendor" });
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).not.toBeChecked();

    userEvent.click(categoryColumn);
    expect(categoryColumn).toBeChecked();
    expect(vendorColumn).not.toBeChecked();

    userEvent.click(vendorColumn);
    expect(categoryColumn).toBeChecked();
    expect(vendorColumn).toBeChecked();

    userEvent.click(categoryColumn);
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).toBeChecked();

    userEvent.click(vendorColumn);
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).not.toBeChecked();
  });

  it("should allow to search for columns", () => {
    setup();
    userEvent.type(screen.getByPlaceholderText("Search for a column…"), "a");

    const taxColumn = screen.getByRole("checkbox", { name: "Tax" });
    const categoryColumn = screen.getByRole("checkbox", { name: "Total" });
    const vendorColumn = screen.queryByRole("checkbox", { name: "Vendor" });
    expect(taxColumn).toBeInTheDocument();
    expect(categoryColumn).toBeInTheDocument();
    expect(vendorColumn).not.toBeInTheDocument();

    userEvent.click(categoryColumn);
    expect(categoryColumn).toBeChecked();
  });
});
