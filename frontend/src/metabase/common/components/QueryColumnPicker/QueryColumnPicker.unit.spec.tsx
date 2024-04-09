import userEvent from "@testing-library/user-event";

import { render, screen, within, fireEvent } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";

import type { QueryColumnPickerProps } from "./QueryColumnPicker";
import { QueryColumnPicker } from "./QueryColumnPicker";

type SetupOpts = Partial<
  Pick<
    QueryColumnPickerProps,
    "query" | "stageIndex" | "hasBinning" | "hasTemporalBucketing"
  >
> & {
  columns?: Lib.ColumnMetadata[];
};

function createQueryWithBreakout() {
  const plainQuery = createQuery();
  const [column] = Lib.breakoutableColumns(plainQuery, 0);
  const query = Lib.breakout(plainQuery, 0, column);
  const [clause] = Lib.breakouts(query, 0);
  const clauseInfo = Lib.displayInfo(query, 0, clause);
  return { query, clause, clauseInfo };
}

function setup({
  query = createQuery(),
  stageIndex = 0,
  columns = Lib.breakoutableColumns(query, stageIndex),
  hasBinning = true,
  hasTemporalBucketing = true,
  ...props
}: SetupOpts = {}) {
  const onSelect = jest.fn();
  const onClose = jest.fn();

  const findColumn = columnFinder(query, columns);

  const sampleColumn = findColumn("ORDERS", "ID");
  const sampleColumnInfo = Lib.displayInfo(query, 0, sampleColumn);

  render(
    <QueryColumnPicker
      {...props}
      query={query}
      stageIndex={stageIndex}
      columnGroups={Lib.groupColumns(columns)}
      hasBinning={hasBinning}
      hasTemporalBucketing={hasTemporalBucketing}
      checkIsColumnSelected={item => item.breakoutPosition === 0}
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

  it("should display column from foreign tables", async () => {
    setup();

    await userEvent.click(screen.getByText("Product"));

    expect(screen.getByRole("option", { name: "ID" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Price" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Category" }),
    ).toBeInTheDocument();
  });

  it("should allow picking a column", async () => {
    const { sampleColumn, sampleColumnInfo, onSelect, onClose } = setup();

    await userEvent.click(screen.getByText(sampleColumnInfo.displayName));

    expect(onSelect).toHaveBeenCalledWith(sampleColumn);
    expect(onClose).toHaveBeenCalled();
  });

  it("should render info icons", () => {
    setup();
    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("should highlight column used in a given clause", () => {
    const { query, clauseInfo } = createQueryWithBreakout();
    setup({ query });

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
      setup({ hasBinning: false, hasTemporalBucketing: false });

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

  it("should allow searching using displayName (#39622)", () => {
    setup();

    screen.getByText("User").click();
    fireEvent.change(screen.getByTestId("list-search-field"), {
      target: { value: "Birth Date" },
    });

    expect(
      screen.getByRole("option", { name: "Birth Date" }),
    ).toBeInTheDocument();
  });
});
