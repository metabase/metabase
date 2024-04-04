import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";

import { FieldPanel } from "./FieldPanel";

interface TestProps {
  query: Lib.Query;
  stageIndex: number;
}

function Test({ query: initialQuery, stageIndex }: TestProps) {
  const [query, setQuery] = useState(initialQuery);

  return (
    <FieldPanel query={query} stageIndex={stageIndex} onChange={setQuery} />
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
  it("should allow to add and remove a column", async () => {
    setup();
    const taxColumn = screen.getByRole("checkbox", { name: "Tax" });
    const totalColumn = screen.getByRole("checkbox", { name: "Total" });
    expect(taxColumn).toBeChecked();
    expect(totalColumn).toBeChecked();

    await userEvent.click(taxColumn);
    expect(taxColumn).not.toBeChecked();
    expect(totalColumn).toBeChecked();

    await userEvent.click(totalColumn);
    expect(taxColumn).not.toBeChecked();
    expect(totalColumn).not.toBeChecked();

    await userEvent.click(taxColumn);
    expect(taxColumn).toBeChecked();
    expect(totalColumn).not.toBeChecked();

    await userEvent.click(totalColumn);
    expect(taxColumn).toBeChecked();
    expect(totalColumn).toBeChecked();
  });

  it("should allow to add and remove an implicitly joinable column", async () => {
    setup();
    const categoryColumn = screen.getByRole("checkbox", { name: "Category" });
    const vendorColumn = screen.getByRole("checkbox", { name: "Vendor" });
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).not.toBeChecked();

    await userEvent.click(categoryColumn);
    expect(categoryColumn).toBeChecked();
    expect(vendorColumn).not.toBeChecked();

    await userEvent.click(vendorColumn);
    expect(categoryColumn).toBeChecked();
    expect(vendorColumn).toBeChecked();

    await userEvent.click(categoryColumn);
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).toBeChecked();

    await userEvent.click(vendorColumn);
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).not.toBeChecked();
  });

  it("should allow to add and remove column groups", async () => {
    setup();
    const productGroup = screen.getByRole("checkbox", { name: "Product" });
    const categoryColumn = screen.getByRole("checkbox", { name: "Category" });
    const vendorColumn = screen.getByRole("checkbox", { name: "Vendor" });
    expect(productGroup).not.toBeChecked();
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).not.toBeChecked();

    await userEvent.click(productGroup);
    expect(productGroup).toBeChecked();
    expect(categoryColumn).toBeChecked();
    expect(vendorColumn).toBeChecked();

    await userEvent.click(productGroup);
    expect(productGroup).not.toBeChecked();
    expect(categoryColumn).not.toBeChecked();
    expect(vendorColumn).not.toBeChecked();
  });

  it("should not allow to remove the last column from the data source", async () => {
    setup();
    const [orderGroup, firstColumn, ...otherColumns] =
      screen.getAllByRole("checkbox");
    expect(orderGroup).toBeChecked();
    expect(orderGroup).toBeDisabled();

    for (const column of otherColumns) {
      await userEvent.click(column);
    }
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeDisabled();
    expect(orderGroup).toBeEnabled();
    expect(orderGroup).not.toBeChecked();

    await userEvent.click(orderGroup);
    expect(firstColumn).toBeChecked();
    expect(firstColumn).toBeEnabled();
  });

  it("should not allow to remove custom columns", () => {
    const query = Lib.expression(
      createQuery(),
      -1,
      "Custom",
      Lib.expressionClause("+", [1, 2]),
    );
    setup({ query });
    const [orderGroup] = screen.getAllByRole("checkbox");
    const customColumn = screen.getByRole("checkbox", { name: "Custom" });
    expect(orderGroup).toBeChecked();
    expect(orderGroup).toBeDisabled();
    expect(customColumn).toBeChecked();
    expect(customColumn).toBeDisabled();
  });

  it("should allow to search for columns", async () => {
    setup();
    await userEvent.type(
      screen.getByPlaceholderText("Search for a column…"),
      "a",
    );

    const taxColumn = screen.getByRole("checkbox", { name: "Tax" });
    const categoryColumn = screen.getByRole("checkbox", { name: "Category" });
    const vendorColumn = screen.queryByRole("checkbox", { name: "Vendor" });
    expect(taxColumn).toBeInTheDocument();
    expect(categoryColumn).toBeInTheDocument();
    expect(vendorColumn).not.toBeInTheDocument();

    await userEvent.click(categoryColumn);
    expect(categoryColumn).toBeChecked();
  });
});
