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

const TYPES = ["Normal", "Fire", "Water", "Grass", "Electric", "Psychic"];
const POINTS_PER_TYPE = 6;

// Points broken out by type, so each type is a legend item.
const createBreakoutSeries = (): RawSeries => [
  {
    card: createMockCard({
      display: "scatter",
      visualization_settings: {
        "graph.dimensions": ["defense", "type_1"],
        "graph.metrics": ["sp_defense"],
      },
    }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({
          name: "defense",
          display_name: "Defense",
          base_type: "type/Integer",
          source: "fields",
        }),
        createMockColumn({
          name: "type_1",
          display_name: "Type 1",
          base_type: "type/Text",
          semantic_type: "type/Category",
          source: "fields",
        }),
        createMockColumn({
          name: "sp_defense",
          display_name: "Sp. Defense",
          base_type: "type/Integer",
          source: "fields",
        }),
      ],
      rows: TYPES.flatMap((type, typeIndex) =>
        Array.from({ length: POINTS_PER_TYPE }, (_, pointIndex) => [
          20 + 15 * pointIndex + typeIndex,
          type,
          30 + 10 * typeIndex + 5 * pointIndex,
        ]),
      ),
    }),
  },
];

const setup = ({ width, height }: { width?: number; height?: number }) => {
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

describe("static scatter plot legend", () => {
  it("sits below the plot, centered on it, and extends the image", () => {
    const { svgHeight, chartHeight, legendTop, plot, rows, itemNames } = setup({
      width: 540,
      height: 360,
    });

    expect(itemNames).toEqual(TYPES);
    expect(chartHeight).toBe(360);
    expect(legendTop).toBe(360);
    expect(svgHeight).toBeGreaterThan(360);
    expect(rows).toHaveLength(1);
    expect(getSpanCenter(rows[0])).toBeCloseTo(getSpanCenter(plot), 0);
  });

  it("wraps the series onto rows inside a narrow plot", () => {
    const { plot, rows, itemNames } = setup({ width: 260, height: 240 });

    expect(itemNames).toEqual(TYPES);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.left).toBeGreaterThanOrEqual(plot.left - 1);
      expect(row.right).toBeLessThanOrEqual(plot.right + 1);
      expect(getSpanCenter(row)).toBeCloseTo(getSpanCenter(plot), 0);
    }
  });
});
