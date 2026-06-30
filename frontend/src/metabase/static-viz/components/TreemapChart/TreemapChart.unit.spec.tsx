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
});
