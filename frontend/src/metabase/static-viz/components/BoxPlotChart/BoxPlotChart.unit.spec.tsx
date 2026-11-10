import { render } from "@testing-library/react";

import { getSpanCenter, getStaticLegendGeometry } from "__support__/static-viz";
import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

const HEIGHT = 360;
const YEARS = ["2024", "2025", "2026"];
const CATEGORIES = ["Doohickey", "Gadget", "Gizmo", "Widget"];
const STATES = ["AK", "AL", "AR", "AZ", "CA"];

// A count per year, category and state: the box of each year/category series
// is the spread over states, and the categories are the legend items.
const createBreakoutSeries = (): RawSeries => [
  {
    card: createMockCard({
      display: "boxplot",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "CATEGORY"],
        "graph.metrics": ["count"],
      },
    }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({
          name: "CREATED_AT",
          display_name: "Created At",
          base_type: "type/DateTime",
          source: "breakout",
          unit: "year",
        }),
        createMockColumn({
          name: "CATEGORY",
          display_name: "Category",
          base_type: "type/Text",
          semantic_type: "type/Category",
          source: "breakout",
        }),
        createMockColumn({
          name: "STATE",
          display_name: "State",
          base_type: "type/Text",
          semantic_type: "type/State",
          source: "breakout",
        }),
        createMockColumn({
          name: "count",
          display_name: "Count",
          base_type: "type/BigInteger",
          semantic_type: "type/Quantity",
          source: "aggregation",
        }),
      ],
      rows: YEARS.flatMap((year, yearIndex) =>
        CATEGORIES.flatMap((category, categoryIndex) =>
          STATES.map((state, stateIndex) => [
            `${year}-01-01T00:00:00Z`,
            category,
            state,
            10 * (yearIndex + 1) + 3 * categoryIndex + 7 * stateIndex,
          ]),
        ),
      ),
    }),
  },
];

const setup = ({
  width,
  height = HEIGHT,
}: {
  width?: number;
  height?: number;
}) => {
  const { container } = render(
    <StaticVisualization
      rawSeries={createBreakoutSeries()}
      renderingContext={createStaticRenderingContext()}
      width={width}
      height={height}
    />,
  );
  return getStaticLegendGeometry(container);
};

describe("static box plot legend", () => {
  it("sits below the plot, centered on it, within the chart height", () => {
    const { svgHeight, chartHeight, legendTop, plot, rows, itemNames } = setup(
      {},
    );

    expect(itemNames).toEqual(CATEGORIES);
    expect(svgHeight).toBe(HEIGHT);
    expect(chartHeight).toBeLessThan(HEIGHT);
    expect(legendTop).toBe(chartHeight);
    expect(rows).toHaveLength(1);
    expect(getSpanCenter(rows[0])).toBeCloseTo(getSpanCenter(plot), 0);
  });

  it("wraps the series onto rows inside a narrow plot", () => {
    const { plot, rows, itemNames } = setup({ width: 240 });

    expect(itemNames).toEqual(CATEGORIES);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.left).toBeGreaterThanOrEqual(plot.left - 1);
      expect(row.right).toBeLessThanOrEqual(plot.right + 1);
      expect(getSpanCenter(row)).toBeCloseTo(getSpanCenter(plot), 0);
    }
  });
});
