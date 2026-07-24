import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { render, screen } from "__support__/ui";
import type { HoveredObject } from "metabase/visualizations/types";

import {
  ChartWithLegend,
  HIDE_HORIZONTAL_LEGEND_THRESHOLD,
  HIDE_SECONDARY_INFO_THRESHOLD,
  getChartLayout,
} from "./ChartWithLegend";
import { LegendHorizontal } from "./LegendHorizontal";
import { LegendVertical } from "./LegendVertical";
import type { LegendHover, LegendTitle } from "./types";

interface SetupProps {
  children?: ReactNode;
  legendTitles: LegendTitle[];
  legendHiddenIndices?: number[];
  legendColors: string[];
  hovered?: HoveredObject | null;
  onHoverChange?: (hover?: LegendHover | null) => void;
  className?: string;
  style?: CSSProperties;
  gridSize?: {
    width: number;
    height: number;
  };
  aspectRatio?: number;
  height: number;
  width: number;
  showLegend?: boolean;
  isDashboard?: boolean;
  isDocument?: boolean;
  onToggleSeriesVisibility?: (event: MouseEvent, index: number) => void;
}

const defaultProps: SetupProps = {
  legendTitles: [
    ["Series 1", "50%"],
    ["Series 2", "50%"],
  ],
  legendColors: ["Red", "Green"],
  showLegend: true,
  width: 800,
  height: 600,
  gridSize: { width: 8, height: 6 },
  children: <div>Chart stub</div>,
};

const setup = (props: Partial<SetupProps> = {}) => {
  render(<ChartWithLegend {...defaultProps} {...props} />);
};

describe("ChartWithLegend", () => {
  it("should show full legend titles when width is above secondary info threshold", () => {
    setup();

    expect(screen.getByTestId("chart-legend")).toHaveTextContent("Series 1");
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("Series 2");
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("50%");
  });

  it("should hide secondary info when width is below threshold", () => {
    setup({ width: HIDE_SECONDARY_INFO_THRESHOLD - 1 });

    expect(screen.getByTestId("chart-legend")).toHaveTextContent("Series 1");
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("Series 2");
    expect(screen.getByTestId("chart-legend")).not.toHaveTextContent("50%");
  });

  it("should not render legend when width is below horizontal legend threshold", () => {
    setup({ width: HIDE_HORIZONTAL_LEGEND_THRESHOLD - 1 });

    expect(screen.queryByTestId("chart-legend")).not.toBeInTheDocument();
  });

  it("should not render chart content when dimensions are zero", () => {
    setup({ width: 0, height: 0 });

    expect(screen.queryByText("Chart stub")).not.toBeInTheDocument();
  });

  it("should render chart content when dimensions are valid", () => {
    setup();

    expect(screen.getByText("Chart stub")).toBeInTheDocument();
  });

  it("should join legend titles with space in vertical layout", () => {
    setup({
      width: 400,
      height: 600,
      gridSize: { width: 3, height: 6 },
      aspectRatio: 0.5,
      legendTitles: [
        ["Foo", "10%"],
        ["Bar", "90%"],
      ],
    });

    expect(screen.getByTestId("chart-legend")).toHaveTextContent("Foo 10%");
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("Bar 90%");
  });
});

describe("getChartLayout", () => {
  const defaultInput: Parameters<typeof getChartLayout>[0] = {
    width: 800,
    height: 400,
    gridSize: undefined,
    aspectRatio: 1,
    legendTitles: ["Series 1", "Series 2"],
  };

  it("should lay out a wide chart horizontally with a fixed chart size", () => {
    const layout = getChartLayout(defaultInput);

    expect(layout).toMatchObject({
      type: "horizontal",
      LegendComponent: LegendVertical,
      chartWidth: 386,
      chartHeight: 386,
      flexChart: false,
      hasDimensions: true,
    });
    expect(layout.processedLegendTitles).toEqual(["Series 1", "Series 2"]);
  });

  it("should hide secondary title info and flex the chart when the area is narrow", () => {
    const layout = getChartLayout({
      ...defaultInput,
      width: 250,
      height: 200,
      legendTitles: [["Series 1", "50%"], "Series 2"],
    });

    expect(layout).toMatchObject({
      type: "horizontal",
      flexChart: true,
      chartWidth: undefined,
      chartHeight: 186,
    });
    expect(layout.processedLegendTitles).toEqual([["Series 1"], "Series 2"]);
  });

  it("should lay out vertically with joined titles when the grid is tall", () => {
    const layout = getChartLayout({
      ...defaultInput,
      height: 600,
      gridSize: { width: 3, height: 8 },
      aspectRatio: 2,
      legendTitles: [["Series 1", "50%"], "Series 2"],
    });

    expect(layout).toMatchObject({
      type: "vertical",
      LegendComponent: LegendHorizontal,
      chartWidth: 772,
      chartHeight: 386,
      flexChart: false,
    });
    expect(layout.processedLegendTitles).toEqual(["Series 1 50%", "Series 2"]);
  });

  it("should use the small layout when the grid has too few columns", () => {
    const layout = getChartLayout({
      ...defaultInput,
      gridSize: { width: 2, height: 8 },
    });

    expect(layout).toMatchObject({
      type: "small",
      LegendComponent: undefined,
      chartWidth: undefined,
      chartHeight: undefined,
      flexChart: false,
    });
  });

  it("should use the small layout when a horizontal chart is below the legend width threshold", () => {
    const layout = getChartLayout({ ...defaultInput, width: 200, height: 100 });

    expect(layout.type).toBe("small");
    expect(layout.LegendComponent).toBeUndefined();
  });

  it("should report missing dimensions when the chart is not measured yet", () => {
    const layout = getChartLayout({ ...defaultInput, width: 0, height: 0 });

    expect(layout).toMatchObject({ type: "small", hasDimensions: false });
  });
});
