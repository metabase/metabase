import { render, screen } from "@testing-library/react";
import ReactDOMServer from "react-dom/server";

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

function toStaticMarkup(element: JSX.Element) {
  return ReactDOMServer.renderToStaticMarkup(element);
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
  ] as RawSeries;
}

describe("static TreemapChart", () => {
  it("renders the chart SVG with a legend row per group and leaf plus a total", () => {
    render(
      <TreemapChart
        rawSeries={makeRawSeries([
          ["Phones", "iPhone", 60],
          ["Phones", "Xiaomi", 20],
          ["Watches", "Garmin", 20],
        ])}
        settings={settings}
        renderingContext={getRenderingContext()}
        isStorybook
      />,
    );

    const legendNames = screen
      .getAllByTestId("legend-name")
      .map((node) => node.textContent);
    expect(legendNames).toEqual([
      "Phones",
      "iPhone",
      "Xiaomi",
      "Watches",
      "Garmin",
      "Total",
    ]);
    // 2-level legend: one color dot per top-level group.
    expect(screen.getAllByTestId("legend-dot")).toHaveLength(2);
  });

  it("renders a 1-level treemap with a flat, dot-less legend", () => {
    render(
      <TreemapChart
        rawSeries={makeRawSeries([
          ["Phones", null, 80],
          ["Watches", null, 20],
        ])}
        settings={
          {
            ...settings,
            "treemap.sub_grouping": undefined,
          } as unknown as ComputedVisualizationSettings
        }
        renderingContext={getRenderingContext()}
        isStorybook
      />,
    );

    const legendNames = screen
      .getAllByTestId("legend-name")
      .map((node) => node.textContent);
    expect(legendNames).toEqual(["Phones", "Watches", "Total"]);
    expect(screen.queryByTestId("legend-dot")).not.toBeInTheDocument();
  });

  it("emits no feDropShadow filters, which Batik cannot transcode to PNG", () => {
    const view = toStaticMarkup(
      <TreemapChart
        rawSeries={makeRawSeries([
          ["Phones", "iPhone", 60],
          ["Phones", "Xiaomi", 20],
          ["Watches", "Garmin", 20],
        ])}
        settings={settings}
        renderingContext={getRenderingContext()}
        isStorybook
      />,
    );

    expect(view).toContain("<svg");
    expect(view).not.toContain("feDropShadow");
  });
});
