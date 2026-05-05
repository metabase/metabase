import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import type * as Lib from "metabase-lib";

import { QueryExplorerBar } from "./QueryExplorerBar";

const CHART_TYPES = [
  { type: "line", icon: "line" as const },
  { type: "area", icon: "area" as const },
  { type: "bar", icon: "bar" as const },
];

describe("QueryExplorerBar", () => {
  it("shows chart type buttons", () => {
    renderWithProviders(
      <QueryExplorerBar
        chartTypes={CHART_TYPES}
        currentChartType="line"
        onChartTypeChange={() => {}}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "line" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "area" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "bar" })).toBeInTheDocument();
  });

  it("calls onChartTypeChange when chart type button is clicked", async () => {
    const user = userEvent.setup();
    const onChartTypeChange = jest.fn();

    renderWithProviders(
      <QueryExplorerBar
        chartTypes={CHART_TYPES}
        currentChartType="line"
        onChartTypeChange={onChartTypeChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "bar" }));

    expect(onChartTypeChange).toHaveBeenCalledWith("bar");
    expect(onChartTypeChange).toHaveBeenCalledTimes(1);
  });

  it("opens the date picker when the time range button is clicked", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <QueryExplorerBar
        chartTypes={CHART_TYPES}
        currentChartType="bar"
        onChartTypeChange={() => {}}
        timeRange={{
          label: "Last 30 days",
          value: undefined,
          availableUnits: [],
          hasActiveFilter: false,
          onChange: () => {},
          onClear: () => {},
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Last 30 days" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Last 30 days" }));

    expect(screen.getByTestId("date-picker-type-specific")).toBeInTheDocument();
  });

  it("opens granularity dropdown and calls onChange when an item is selected", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const mockBucket = {} as Lib.Bucket;

    renderWithProviders(
      <QueryExplorerBar
        chartTypes={CHART_TYPES}
        currentChartType="bar"
        onChartTypeChange={() => {}}
        timeGranularity={{
          label: "by month",
          currentUnit: "month",
          availableItems: [
            { bucket: mockBucket, unit: "month", label: "Month" },
            { bucket: mockBucket, unit: "year", label: "Year" },
          ],
          onChange,
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "by month" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "by month" }));

    expect(screen.getByRole("option", { name: "Month" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Year" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Year" }));

    expect(onChange).toHaveBeenCalledWith(mockBucket);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("renders the table chart type button when provided", () => {
    renderWithProviders(
      <QueryExplorerBar
        chartTypes={[
          ...CHART_TYPES,
          { type: "table", icon: "table2" as const },
        ]}
        currentChartType="table"
        onChartTypeChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "table" })).toBeInTheDocument();
  });

  it("calls onExplore when Explore button is clicked", async () => {
    const user = userEvent.setup();
    const onExplore = jest.fn();

    renderWithProviders(
      <QueryExplorerBar
        chartTypes={CHART_TYPES}
        currentChartType="line"
        onChartTypeChange={jest.fn()}
        onExplore={onExplore}
      />,
    );

    expect(
      screen.getByRole("button", { name: /explore/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /explore/i }));

    expect(onExplore).toHaveBeenCalledTimes(1);
  });

  it("does not show Explore button when onExplore is not provided", () => {
    renderWithProviders(
      <QueryExplorerBar
        chartTypes={CHART_TYPES}
        currentChartType="line"
        onChartTypeChange={jest.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /explore/i }),
    ).not.toBeInTheDocument();
  });

  it("renders remaining controls when chart type controls are empty", () => {
    renderWithProviders(
      <QueryExplorerBar
        chartTypes={[]}
        currentChartType=""
        onChartTypeChange={jest.fn()}
        timeRange={{
          label: "2024 only",
          value: undefined,
          availableUnits: [],
          hasActiveFilter: true,
          onChange: jest.fn(),
          onClear: jest.fn(),
        }}
        onExplore={jest.fn()}
      />,
    );

    expect(screen.getByTestId("query-explorer-bar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "2024 only" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /explore/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "line" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "bar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "area" }),
    ).not.toBeInTheDocument();
  });
});
