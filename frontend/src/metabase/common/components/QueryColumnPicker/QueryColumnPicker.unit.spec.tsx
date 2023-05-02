import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import QueryColumnPicker from "./QueryColumnPicker";

type SetupOpts = {
  query?: Lib.Query;
  columnGroups?: Lib.ColumnGroup[];
};

function setup({
  query = createQuery(),
  columnGroups = Lib.groupColumns(Lib.orderableColumns(query)),
}: SetupOpts = {}) {
  const onSelect = jest.fn();
  const onClose = jest.fn();

  const [sampleColumn] = Lib.orderableColumns(query);
  const sampleColumnInfo = Lib.displayInfo(query, sampleColumn);

  render(
    <QueryColumnPicker
      query={query}
      columnGroups={columnGroups}
      onSelect={onSelect}
      onClose={onClose}
    />,
  );

  return { sampleColumn, sampleColumnInfo, onSelect, onClose };
}

describe("QueryColumnPicker", () => {
  it("should display columns grouped by tables", () => {
    setup();

    // Tables
    expect(screen.getByText("Order")).toBeInTheDocument();
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();

    // Columns
    expect(screen.getByRole("option", { name: "ID" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "User ID" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tax" })).toBeInTheDocument();
  });

  it("should display column from foreign tables", () => {
    setup();

    userEvent.click(screen.getByText("Product"));

    expect(screen.getByRole("option", { name: "ID" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Price" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Category" }),
    ).toBeInTheDocument();
  });

  it("should allow picking a column", async () => {
    const { sampleColumn, sampleColumnInfo, onSelect, onClose } = setup();

    userEvent.click(screen.getByText(sampleColumnInfo.displayName));

    expect(onSelect).toHaveBeenCalledWith(sampleColumn);
    expect(onClose).toHaveBeenCalled();
  });
});
