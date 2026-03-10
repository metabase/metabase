import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { render, screen } from "__support__/ui";
import type { HoveredObject } from "metabase/visualizations/types";

import {
  ChartWithLegend,
  HIDE_HORIZONTAL_LEGEND_THRESHOLD,
  HIDE_SECONDARY_INFO_THRESHOLD,
} from "./ChartWithLegend";

type LegendTitle = string | string[];

type LegendHover = {
  index: number;
  element?: HTMLElement | null;
};

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
