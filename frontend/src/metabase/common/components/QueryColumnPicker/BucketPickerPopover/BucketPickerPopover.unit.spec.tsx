import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";

import { BucketPickerPopover } from "./BucketPickerPopover";

const query = createQuery();
const findColumn = columnFinder(query, Lib.breakoutableColumns(query, 0));
const dateColumn = findColumn("ORDERS", "CREATED_AT");
const numericColumn = findColumn("ORDERS", "TOTAL");
const coordinateColumn = findColumn("PEOPLE", "LATITUDE");

function setup({ column }: { column: Lib.ColumnMetadata }) {
  const onSelect = jest.fn();
  render(
    <div data-testid="container">
      <BucketPickerPopover
        query={query}
        stageIndex={0}
        column={column}
        isEditing
        hasBinning
        hasTemporalBucketing
        onSelect={onSelect}
      />
    </div>,
  );
}

async function setupBinningPicker({ column }: { column: Lib.ColumnMetadata }) {
  setup({ column });
  await userEvent.click(screen.getByLabelText("Binning strategy"));
  await screen.findByText("Auto bin");
}

async function setupTemporalBucketPicker({
  column,
}: {
  column: Lib.ColumnMetadata;
}) {
  setup({ column });
  await userEvent.click(screen.getByLabelText("Temporal bucket"));
  await screen.findByText("Year");
}

describe("BucketPickerPopover", () => {
  it("should collapse advanced temporal bucket options", async () => {
    const buckets = Lib.availableTemporalBuckets(query, 0, dateColumn);
    await setupTemporalBucketPicker({ column: dateColumn });

    expect(screen.getAllByRole("menuitem")).toHaveLength(7);
    expect(screen.getByText("Minute")).toBeInTheDocument();
    expect(screen.getByText("Year")).toBeInTheDocument();

    expect(screen.queryByText("Minute of hour")).not.toBeInTheDocument();
    expect(screen.queryByText("Day of month")).not.toBeInTheDocument();
    expect(screen.queryByText("Month of year")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More…" }));

    expect(screen.getAllByRole("menuitem")).toHaveLength(
      [...buckets, "Don't bin"].length,
    );
  });

  it("should collapse advanced binning options for coordinate columns", async () => {
    const strategies = Lib.availableBinningStrategies(
      query,
      0,
      coordinateColumn,
    );
    await setupBinningPicker({ column: coordinateColumn });
    expect(screen.getAllByRole("menuitem")).toHaveLength(5);
    expect(screen.getByText("Bin every 0.1 degrees")).toBeInTheDocument();
    expect(screen.getByText("Bin every 20 degrees")).toBeInTheDocument();
    expect(
      screen.queryByText("Bin every 0.05 degrees"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Bin every 0.01 degrees"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Bin every 0.005 degrees"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More…" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(
      [...strategies, "Don't bin"].length,
    );
  });

  it("shouldn't show the More button if there are a few binning options for numeric columns", async () => {
    const strategies = Lib.availableBinningStrategies(query, 0, numericColumn);
    await setupBinningPicker({ column: numericColumn });

    expect(screen.getAllByRole("menuitem")).toHaveLength(
      [...strategies, "Don't bin"].length,
    );
    expect(screen.queryByText("More…")).not.toBeInTheDocument();
  });

  it("should expand the list if the selected bucket is in the hidden part", async () => {
    const buckets = Lib.availableTemporalBuckets(query, 0, dateColumn);
    const lastBucket = buckets[buckets.length - 1];
    const column = Lib.withTemporalBucket(dateColumn, lastBucket);
    await setupTemporalBucketPicker({ column });

    expect(screen.getAllByRole("menuitem")).toHaveLength(
      [...buckets, "Don't bin"].length,
    );
    expect(screen.queryByText("More…")).not.toBeInTheDocument();
  });

  it("should expand the list if the selected binning option is in the hidden part", async () => {
    const strategies = Lib.availableBinningStrategies(
      query,
      0,
      coordinateColumn,
    );
    const lastStrategy = strategies[strategies.length - 1];
    const column = Lib.withBinning(coordinateColumn, lastStrategy);
    await setupBinningPicker({ column });

    expect(screen.getAllByRole("menuitem")).toHaveLength(
      [...strategies, "Don't bin"].length,
    );
    expect(screen.queryByText("More…")).not.toBeInTheDocument();
  });

  it("should collapse after popover is closed", async () => {
    await setupTemporalBucketPicker({ column: dateColumn });

    await userEvent.click(screen.getByRole("button", { name: "More…" }));
    // Clicking outside the popover should close it
    await userEvent.click(screen.getByTestId("container"));

    await waitFor(() => expect(screen.queryByText("Month")).not.toBeVisible());

    await userEvent.click(screen.getByLabelText("Temporal bucket"));
    await screen.findByText("Month");

    expect(screen.getAllByRole("menuitem")).toHaveLength(7);
  });

  it("shouldn't collapse after popover is closed if the selected bucket is in the hidden part", async () => {
    const buckets = Lib.availableTemporalBuckets(query, 0, dateColumn);
    const lastBucket = buckets[buckets.length - 1];
    const column = Lib.withTemporalBucket(dateColumn, lastBucket);
    await setupTemporalBucketPicker({ column });

    // Clicking outside the popover should close it
    await userEvent.click(screen.getByTestId("container"));

    await waitFor(() => expect(screen.getByText("Month")).not.toBeVisible());

    await userEvent.click(screen.getByLabelText("Temporal bucket"));
    await screen.findByText("Month");

    expect(screen.getAllByRole("menuitem")).toHaveLength(
      [...buckets, "Don't bin"].length,
    );
  });
});
