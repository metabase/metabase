import { render, screen } from "@testing-library/react";

import ChartWithLegend, {
  HIDE_HORIZONTAL_LEGEND_THRESHOLD,
  HIDE_SECONDARY_INFO_THRESHOLD,
} from "./ChartWithLegend";

const defaultProps = {
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

describe("ChartWithLegend", () => {
  it("should show full legend titles when width is above secondary info threshold", () => {
    render(<ChartWithLegend {...defaultProps} />);

    expect(screen.getByTestId("chart-legend")).toHaveTextContent("Series 1");
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("Series 2");
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("50%");
  });

  it("should hide secondary info when width is below threshold", () => {
    render(
      <ChartWithLegend
        {...defaultProps}
        width={HIDE_SECONDARY_INFO_THRESHOLD - 1}
      />,
    );

    expect(screen.getByTestId("chart-legend")).toHaveTextContent("Series 1");
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("Series 2");
    expect(screen.getByTestId("chart-legend")).not.toHaveTextContent("50%");
  });

  it("should not render legend when width is below horizontal legend threshold", () => {
    render(
      <ChartWithLegend
        {...defaultProps}
        width={HIDE_HORIZONTAL_LEGEND_THRESHOLD - 1}
      />,
    );

    expect(screen.queryByTestId("chart-legend")).not.toBeInTheDocument();
  });

  it("should not render chart content when dimensions are zero", () => {
    render(<ChartWithLegend {...defaultProps} width={0} height={0} />);

    expect(screen.queryByText("Chart stub")).not.toBeInTheDocument();
  });

  it("should render chart content when dimensions are valid", () => {
    render(<ChartWithLegend {...defaultProps} />);

    expect(screen.getByText("Chart stub")).toBeInTheDocument();
  });
});
