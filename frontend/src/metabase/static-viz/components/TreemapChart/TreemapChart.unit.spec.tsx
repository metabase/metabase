import { render, screen } from "@testing-library/react";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { TreemapChart } from "./TreemapChart";

function getRenderingContext() {
  return createStaticRenderingContext();
}

const settings = {
  "treemap.grouping": "Category",
  "treemap.sub_grouping": "SubCategory",
  "treemap.value": "Amount",
  column: () => ({}),
} as unknown as ComputedVisualizationSettings;

function makeRawSeries(rows: (string | number | null)[][]): RawSeries {
  return [
    {
      card: createMockCard({ display: "treemap" }),
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "Category",
            display_name: "Category",
            base_type: "type/Text",
          }),
          createMockColumn({
            name: "SubCategory",
            display_name: "Sub-Category",
            base_type: "type/Text",
          }),
          createMockColumn({
            name: "Amount",
            display_name: "Amount",
            base_type: "type/Number",
            semantic_type: "type/Number",
          }),
        ],
        rows,
      }),
    },
  ];
}

describe("static TreemapChart", () => {
  it("renders one legend row per top-level group, sorted by value desc, plus a total", () => {
    render(
      <TreemapChart
        rawSeries={makeRawSeries([
          ["Soy", "Tempeh", 20],
          ["Legumes", "Chickpeas", 60],
          ["Legumes", "Lentils", 20],
        ])}
        settings={settings}
        renderingContext={getRenderingContext()}
        isStorybook
      />,
    );

    const legendNames = screen
      .getAllByTestId("legend-name")
      .map((node) => node.textContent);
    expect(legendNames).toEqual(["Legumes", "Soy", "Total"]);

    expect(screen.getAllByTestId("legend-dot")).toHaveLength(2);
  });

  it("renders a 1-level treemap with a flat, dot-less legend", () => {
    render(
      <TreemapChart
        rawSeries={makeRawSeries([
          ["Legumes", null, 80],
          ["Soy", null, 20],
        ])}
        settings={{
          ...settings,
          "treemap.sub_grouping": undefined,
        }}
        renderingContext={getRenderingContext()}
        isStorybook
      />,
    );

    const legendNames = screen
      .getAllByTestId("legend-name")
      .map((node) => node.textContent);
    expect(legendNames).toEqual(["Legumes", "Soy", "Total"]);
    expect(screen.queryByTestId("legend-dot")).not.toBeInTheDocument();
  });

  it("uses the fixed intrinsic size when no output box is provided", () => {
    render(
      <TreemapChart
        rawSeries={makeRawSeries([
          ["Legumes", "Chickpeas", 60],
          ["Soy", "Tempeh", 20],
        ])}
        settings={settings}
        renderingContext={getRenderingContext()}
        isStorybook
      />,
    );

    const svg = screen.getByTestId("treemap-root");
    // CHART_WIDTH(965) + LEGEND_GAP(48) + LEGEND_WIDTH(363)
    expect(svg).toHaveAttribute("width", "1376");
    expect(svg).toHaveAttribute("height", "764");
  });

  it("fills the provided output box with no legend so the tiles span the full width", () => {
    render(
      <TreemapChart
        rawSeries={makeRawSeries([
          ["Legumes", "Chickpeas", 60],
          ["Soy", "Tempeh", 20],
        ])}
        settings={settings}
        renderingContext={getRenderingContext()}
        width={1200}
        height={320}
        fitWithinBounds
        isStorybook
      />,
    );

    const svg = screen.getByTestId("treemap-root");
    expect(svg).toHaveAttribute("width", "1200");
    expect(svg).toHaveAttribute("height", "320");

    // The grid/PDF render drops the side legend entirely so the treemap spans the full width.
    expect(screen.queryByTestId("legend-name")).not.toBeInTheDocument();
    expect(screen.queryByTestId("legend-dot")).not.toBeInTheDocument();
  });
});
