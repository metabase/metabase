import { render, screen } from "@testing-library/react";

import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

const CATEGORIES = Array.from({ length: 16 }, (_, index) => `C${index + 1}`);
// Offsets keep segment values clear of the round numbers used as axis ticks.
const SOURCE_A_VALUES = CATEGORIES.map((_, index) => 1003 + index);
const SOURCE_B_VALUES = CATEGORIES.map((_, index) => 2005 + index);
const STACK_TOTALS = CATEGORIES.map(
  (_, index) => SOURCE_A_VALUES[index] + SOURCE_B_VALUES[index],
);

const createStackedRowSeries = (
  settings: VisualizationSettings = {},
): RawSeries => [
  {
    card: createMockCard({
      display: "row",
      visualization_settings: {
        "graph.dimensions": ["CATEGORY", "SOURCE"],
        "graph.metrics": ["count"],
        "stackable.stack_type": "stacked",
        "graph.show_values": true,
        ...settings,
      },
    }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({
          name: "CATEGORY",
          display_name: "Category",
          base_type: "type/Text",
          semantic_type: "type/Category",
          source: "breakout",
        }),
        createMockColumn({
          name: "SOURCE",
          display_name: "Source",
          id: 2,
          field_ref: ["field", 2, null],
          base_type: "type/Text",
          semantic_type: "type/Category",
          source: "breakout",
        }),
        createMockColumn({
          name: "count",
          display_name: "Count",
          base_type: "type/Integer",
          semantic_type: "type/Quantity",
          source: "aggregation",
        }),
      ],
      rows: CATEGORIES.flatMap((category, index) => [
        [category, "A", SOURCE_A_VALUES[index]],
        [category, "B", SOURCE_B_VALUES[index]],
      ]),
    }),
  },
];

const setup = ({
  settings,
  width,
}: {
  settings?: VisualizationSettings;
  width: number;
}) => {
  render(
    <StaticVisualization
      rawSeries={createStackedRowSeries(settings)}
      renderingContext={createStaticRenderingContext()}
      width={width}
      height={900}
    />,
  );

  const countRendered = (values: number[]) =>
    values.filter(
      (value) =>
        screen.queryAllByText(value.toLocaleString("en-US")).length > 0,
    ).length;

  return { countRendered };
};

describe("static row chart", () => {
  it.each([300, 620])(
    "labels every stack total on a %ipx-wide chart",
    (width) => {
      const { countRendered } = setup({ width });

      expect(countRendered(STACK_TOTALS)).toBe(CATEGORIES.length);
    },
  );

  it.each(["series", "all"] as const)(
    "ignores a stored show_stack_values of %s carried over from a bar chart",
    (showStackValues) => {
      const { countRendered } = setup({
        width: 620,
        settings: { "graph.show_stack_values": showStackValues },
      });

      expect(countRendered(STACK_TOTALS)).toBe(CATEGORIES.length);
      expect(countRendered(SOURCE_A_VALUES)).toBe(0);
      expect(countRendered(SOURCE_B_VALUES)).toBe(0);
    },
  );
});
