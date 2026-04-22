import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";

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
        onChartTypeChange={jest.fn()}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "line" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "area" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "bar" })).toBeInTheDocument();
  });

  it("calls onChartTypeChange when chart type button is clicked", async () => {
    const onChartTypeChange = jest.fn();

    renderWithProviders(
      <QueryExplorerBar
        chartTypes={CHART_TYPES}
        currentChartType="line"
        onChartTypeChange={onChartTypeChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "bar" }));

    expect(onChartTypeChange).toHaveBeenCalledWith("bar");
    expect(onChartTypeChange).toHaveBeenCalledTimes(1);
  });

  it("renders optional control slots when provided", () => {
    renderWithProviders(
      <QueryExplorerBar
        chartTypes={CHART_TYPES}
        currentChartType="line"
        onChartTypeChange={jest.fn()}
        filterControl={<span>date filter</span>}
        granularityControl={<span>granularity picker</span>}
      />,
    );

    expect(screen.getByText("date filter")).toBeInTheDocument();
    expect(screen.getByText("granularity picker")).toBeInTheDocument();
  });

  it("renders the table chart type button when provided", () => {
    renderWithProviders(
      <QueryExplorerBar
        chartTypes={[...CHART_TYPES, { type: "table", icon: "table2" }]}
        currentChartType="table"
        onChartTypeChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "table" })).toBeInTheDocument();
  });
});
