import { render, screen } from "@testing-library/react";

import { measureTextWidth } from "metabase/static-viz/lib/text";
import type { RenderingContext } from "metabase/visualizations/types";

import { TreemapLegend } from "./TreemapLegend";
import type { TreemapLegendModel } from "./legend";

const renderingContext = {
  getColor: (color: string) => color,
  measureText: (text: string, style: { size: number; weight: number }) =>
    measureTextWidth(text, style.size, style.weight),
  measureTextHeight: () => 16,
  fontFamily: "Lato",
  theme: {} as RenderingContext["theme"],
} as RenderingContext;

const model: TreemapLegendModel = {
  rows: [
    {
      type: "parent",
      name: "Legumes",
      valueLabel: "$60",
      percentLabel: "60.00 %",
      color: "#509ee3",
      indent: false,
      top: 0,
    },
    {
      type: "leaf",
      name: "Chickpeas",
      valueLabel: "$40",
      percentLabel: "40.00 %",
      indent: true,
      top: 28,
    },
    {
      type: "total",
      name: "Total",
      valueLabel: "$100",
      percentLabel: "100 %",
      indent: true,
      top: 96,
    },
  ],
  height: 112,
};

function setup() {
  return render(
    <svg>
      <TreemapLegend model={model} renderingContext={renderingContext} />
    </svg>,
  );
}

describe("TreemapLegend", () => {
  it("renders every row's name, value, and percent", () => {
    setup();

    expect(screen.getByText("Legumes")).toBeInTheDocument();
    expect(screen.getByText("$60")).toBeInTheDocument();
    expect(screen.getByText("60.00 %")).toBeInTheDocument();
    expect(screen.getByText("Chickpeas")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("100 %")).toBeInTheDocument();
  });

  it("bolds parent and total rows but not leaf rows", () => {
    setup();

    const [legumes, chickpeas, total] = screen.getAllByTestId("legend-name");
    expect(legumes).toHaveAttribute("font-weight", "700");
    expect(total).toHaveAttribute("font-weight", "700");
    expect(chickpeas).toHaveAttribute("font-weight", "400");
  });

  it("draws a color dot only for rows with a color, and one separator line", () => {
    setup();

    const dots = screen.getAllByTestId("legend-dot");
    expect(dots).toHaveLength(1);
    expect(dots[0]).toHaveAttribute("fill", "#509ee3");
    expect(screen.getAllByTestId("legend-separator")).toHaveLength(1);
  });
});
