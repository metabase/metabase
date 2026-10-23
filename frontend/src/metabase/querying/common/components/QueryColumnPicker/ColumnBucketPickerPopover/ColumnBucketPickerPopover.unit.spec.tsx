import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  columnFinder,
} from "metabase-lib/test-helpers";

import { ColumnBucketPickerPopover } from "./ColumnBucketPickerPopover";

const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
const findColumn = columnFinder(query, Lib.breakoutableColumns(query, 0));
const dateColumn = findColumn("ORDERS", "CREATED_AT");
const numericColumn = findColumn("ORDERS", "TOTAL");
const coordinateColumn = findColumn("PEOPLE", "LATITUDE");

interface SetupOpts {
  column: Lib.ColumnMetadata;
}

function setup({ column }: SetupOpts) {
  const onSelect = jest.fn<void, [Lib.ColumnMetadata]>();
  render(
    <div data-testid="container">
      <ColumnBucketPickerPopover
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
  return { onSelect };
}

async function setupBinningPicker({ column }: SetupOpts) {
  const result = setup({ column });
  await userEvent.click(screen.getByLabelText("Binning strategy"));
  await screen.findByText("Auto bin");
  return result;
}

async function setupTemporalBucketPicker({ column }: SetupOpts) {
  const result = setup({ column });
  await userEvent.click(screen.getByLabelText("Temporal bucket"));
  await screen.findByText("Year");
  return result;
}

function getOptionNames() {
  return screen
    .getAllByRole("menuitem")
    .map((option) => option.textContent ?? "");
}

const NUMBER_BUCKETS = [
  "Auto bin",
  "10 bins",
  "50 bins",
  "100 bins",
  "Don't bin",
];

const TIME_BUCKETS = [
  "Minute",
  "Hour",
  "Day",
  "Week",
  "Month",
  "Quarter",
  "Year",
  "Minute of hour",
  "Hour of day",
  "Day of week",
  "Day of month",
  "Day of year",
  "Week of year",
  "Month of year",
  "Quarter of year",
  "Don't bin",
];

const COORDINATE_BUCKETS = [
  "Auto bin",
  "Bin every 0.1 degrees",
  "Bin every 1 degree",
  "Bin every 10 degrees",
  "Bin every 20 degrees",
  "Bin every 0.05 degrees",
  "Bin every 0.01 degrees",
  "Bin every 0.005 degrees",
  "Don't bin",
];

describe("ColumnBucketPickerPopover", () => {
  it("should list every binning option of a numeric column once", async () => {
    await setupBinningPicker({ column: numericColumn });
    expect(getOptionNames()).toEqual(NUMBER_BUCKETS);
  });

  it("should list every temporal bucket once when expanded", async () => {
    await setupTemporalBucketPicker({ column: dateColumn });
    await userEvent.click(screen.getByRole("button", { name: "More…" }));
    expect(getOptionNames()).toEqual(TIME_BUCKETS);
  });

  it("should list every binning option of a coordinate column once when expanded", async () => {
    await setupBinningPicker({ column: coordinateColumn });
    await userEvent.click(screen.getByRole("button", { name: "More…" }));
    expect(getOptionNames()).toEqual(COORDINATE_BUCKETS);
  });

  it("should highlight the selected binning option of a coordinate column", async () => {
    const strategy = Lib.availableBinningStrategies(
      query,
      0,
      coordinateColumn,
    ).find(
      (strategy) =>
        Lib.displayInfo(query, 0, strategy).displayName ===
        "Bin every 20 degrees",
    );
    const column = Lib.withBinning(coordinateColumn, strategy ?? null);
    await setupBinningPicker({ column });

    expect(
      screen.getByRole("menuitem", { name: "Bin every 20 degrees" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("menuitem", { name: "Auto bin" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("should apply the picked binning option of a coordinate column", async () => {
    const { onSelect } = await setupBinningPicker({ column: coordinateColumn });

    await userEvent.click(
      screen.getByRole("menuitem", { name: "Bin every 20 degrees" }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [nextColumn] = onSelect.mock.calls[0];
    const binning = Lib.binning(nextColumn);
    expect(binning && Lib.displayInfo(query, 0, binning).displayName).toBe(
      "20°",
    );
  });

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
    expect(screen.getByText("Month")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More…" }));
    // Clicking outside the popover should close it
    await userEvent.click(screen.getByTestId("container"));

    await waitFor(() =>
      expect(screen.queryByText("Month")).not.toBeInTheDocument(),
    );

    await userEvent.click(screen.getByLabelText("Temporal bucket"));
    await screen.findByText("Month");

    expect(screen.getAllByRole("menuitem")).toHaveLength(7);
  });

  it("shouldn't collapse after popover is closed if the selected bucket is in the hidden part", async () => {
    const buckets = Lib.availableTemporalBuckets(query, 0, dateColumn);
    const lastBucket = buckets[buckets.length - 1];
    const column = Lib.withTemporalBucket(dateColumn, lastBucket);
    await setupTemporalBucketPicker({ column });

    expect(screen.getByText("Month")).toBeVisible();

    // Clicking outside the popover should close it
    await userEvent.click(screen.getByTestId("container"));

    await waitFor(() =>
      expect(screen.queryByText("Month")).not.toBeInTheDocument(),
    );

    await userEvent.click(screen.getByLabelText("Temporal bucket"));
    await screen.findByText("Month");

    expect(screen.getAllByRole("menuitem")).toHaveLength(
      [...buckets, "Don't bin"].length,
    );
  });
});
