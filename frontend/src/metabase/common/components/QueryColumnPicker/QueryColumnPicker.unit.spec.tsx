import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import QueryColumnPicker, { QueryColumnPickerProps } from "./QueryColumnPicker";

type SetupOpts = Partial<
  Pick<QueryColumnPickerProps, "query" | "clause" | "hasBucketing">
> & {
  columns?: Lib.ColumnMetadata[];
};

function createQueryWithBreakout() {
  const plainQuery = createQuery();
  const [column] = Lib.breakoutableColumns(plainQuery);
  const query = Lib.breakout(plainQuery, column);
  const [clause] = Lib.breakouts(query);
  const clauseInfo = Lib.displayInfo(query, clause);
  return { query, clause, clauseInfo };
}

function setup({
  query = createQuery(),
  columns = Lib.breakoutableColumns(query),
  hasBucketing = true,
  ...props
}: SetupOpts = {}) {
  const onSelect = jest.fn();
  const onClose = jest.fn();

  const [sampleColumn] = columns;
  const sampleColumnInfo = Lib.displayInfo(query, sampleColumn);

  render(
    <QueryColumnPicker
      {...props}
      query={query}
      columnGroups={Lib.groupColumns(columns)}
      hasBucketing={hasBucketing}
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

  it("should allow picking a column", () => {
    const { sampleColumn, sampleColumnInfo, onSelect, onClose } = setup();

    userEvent.click(screen.getByText(sampleColumnInfo.displayName));

    expect(onSelect).toHaveBeenCalledWith(sampleColumn);
    expect(onClose).toHaveBeenCalled();
  });

  it("should highlight column used in a given clause", () => {
    const { query, clause, clauseInfo } = createQueryWithBreakout();
    setup({ query, clause });

    const option = screen.getByRole("option", { name: clauseInfo.displayName });
    expect(option).toBeInTheDocument();
    expect(option).toHaveAttribute("aria-selected", "true");
  });

  describe("bucketing", () => {
    it("shouldn't show bucketing options for non-bucketable columns", () => {
      setup();

      const id = screen.getByRole("option", { name: "ID" });

      expect(
        within(id).queryByLabelText("Binning strategy"),
      ).not.toBeInTheDocument();
      expect(
        within(id).queryByLabelText("Temporal bucket"),
      ).not.toBeInTheDocument();
    });

    it("shouldn't show bucketing options if bucketing is disabled", () => {
      setup({ hasBucketing: false });

      const total = screen.getByRole("option", { name: "Total" });
      const createdAt = screen.getByRole("option", { name: "Created At" });

      expect(
        within(total).queryByLabelText("Binning strategy"),
      ).not.toBeInTheDocument();
      expect(
        within(createdAt).queryByLabelText("Temporal bucket"),
      ).not.toBeInTheDocument();
    });
  });
});
