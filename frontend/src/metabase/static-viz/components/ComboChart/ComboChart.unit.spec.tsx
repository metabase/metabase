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

const CHART_HEIGHT = 440;
const AXIS_TITLE_FONT_SIZE = 13;

const categoryColumn = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
  base_type: "type/Text",
  semantic_type: "type/Category",
  source: "breakout",
});

const metricColumns = [
  createMockColumn({
    name: "count",
    display_name: "Count",
    base_type: "type/Integer",
    semantic_type: "type/Quantity",
    source: "aggregation",
  }),
  createMockColumn({
    name: "sum",
    display_name: "Sum of Total",
    id: 3,
    field_ref: ["field", 3, null],
    base_type: "type/Integer",
    semantic_type: "type/Quantity",
    source: "aggregation",
  }),
];

const createGroupedRowSeries = ({
  metricCount,
  settings = {},
  getValue = (rowIndex, metricIndex) => 100 * (rowIndex + metricIndex + 1),
  categories = ["Doohickey", "Gadget", "Gizmo", "Widget"],
}: {
  metricCount: 1 | 2;
  settings?: VisualizationSettings;
  getValue?: (rowIndex: number, metricIndex: number) => number;
  categories?: string[];
}): RawSeries => {
  const metrics = metricColumns.slice(0, metricCount);
  return [
    {
      card: createMockCard({
        display: "row",
        visualization_settings: {
          "graph.dimensions": ["CATEGORY"],
          "graph.metrics": metrics.map((column) => column.name),
          ...settings,
        },
      }),
      data: createMockDatasetData({
        cols: [categoryColumn, ...metrics],
        rows: categories.map((category, index) => [
          category,
          ...metrics.map((_, metricIndex) => getValue(index, metricIndex)),
        ]),
      }),
    },
  ];
};

// ECharts SSR positions text with `translate(x y)`, or `matrix(a,b,c,d,x,y)`
// when rotated, and centres it on that anchor (`dominant-baseline="central"`).
const TEXT_ANCHOR_PATTERN =
  /^(?:translate\(([-\d.]+) ([-\d.]+)\)|matrix\((?:[-\d.]+,){4}([-\d.]+),([-\d.]+)\))$/;

const getTextAnchors = (text: string) =>
  screen.queryAllByText(text).flatMap((element) => {
    const match = element.getAttribute("transform")?.match(TEXT_ANCHOR_PATTERN);
    return match
      ? [{ x: Number(match[1] ?? match[3]), y: Number(match[2] ?? match[4]) }]
      : [];
  });

const renderRowChart = (rawSeries: RawSeries) =>
  render(
    <StaticVisualization
      rawSeries={rawSeries}
      renderingContext={createStaticRenderingContext()}
      width={620}
      height={CHART_HEIGHT}
    />,
  );

describe("static row chart", () => {
  it("spaces metric ticks by the chart width, like the legacy renderer", () => {
    const values = [-155, 210, 100, -50];
    renderRowChart(
      createGroupedRowSeries({
        metricCount: 1,
        getValue: (rowIndex) => values[rowIndex],
      }),
    );

    // Five fixed intervals would round the axis out to 300; width-based
    // spacing ticks every 50 and stops at 250.
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.queryByText("300")).not.toBeInTheDocument();
  });

  it("caps the metric tick count like the legacy renderer, without labelling the rounded axis end", () => {
    const values = [1005, 700, 400, 100];
    renderRowChart(
      createGroupedRowSeries({
        metricCount: 1,
        getValue: (rowIndex) => values[rowIndex],
      }),
    );

    // ~9 ticks fit: capped d3 steps of 200 (a hint would give 100), ending at an
    // unlabelled 1,100.
    expect(screen.getByText("1,000")).toBeInTheDocument();
    expect(screen.queryByText("100")).not.toBeInTheDocument();
    expect(screen.queryByText("1,100")).not.toBeInTheDocument();
    expect(screen.queryByText("1,200")).not.toBeInTheDocument();
  });

  it("extends the metric axis to the folded Other row's total", () => {
    renderRowChart(
      createGroupedRowSeries({
        metricCount: 1,
        categories: Array.from({ length: 40 }, (_, index) => `C${index + 1}`),
        getValue: () => 100,
      }),
    );

    // Rows of 100 fold into an "Other" worth thousands; the axis must reach it.
    expect(screen.getByText(/^Other \(\d+\)$/)).toBeInTheDocument();
    expect(screen.getByText("1,000")).toBeInTheDocument();
  });

  describe("folded Other row labels", () => {
    const FOLDED_CATEGORIES = Array.from(
      { length: 40 },
      (_, index) => `C${index + 1}`,
    );

    const getFoldedRowCount = () =>
      Number(
        /\((\d+)\)/.exec(
          screen.getByText(/^Other \(\d+\)$/).textContent ?? "",
        )?.[1],
      );

    it("labels the Other row's value", () => {
      renderRowChart(
        createGroupedRowSeries({
          metricCount: 1,
          categories: FOLDED_CATEGORIES,
          getValue: () => 13,
          settings: { "graph.show_values": true },
        }),
      );

      // Labels render twice: an outline stroke and the fill.
      expect(
        screen.getAllByText(String(getFoldedRowCount() * 13)).length,
      ).toBeGreaterThan(0);
    });

    it("labels the Other row's stack total", () => {
      const sourceColumn = createMockColumn({
        name: "SOURCE",
        display_name: "Source",
        id: 2,
        field_ref: ["field", 2, null],
        base_type: "type/Text",
        semantic_type: "type/Category",
        source: "breakout",
      });
      renderRowChart([
        {
          card: createMockCard({
            display: "row",
            visualization_settings: {
              "graph.dimensions": ["CATEGORY", "SOURCE"],
              "graph.metrics": ["count"],
              "stackable.stack_type": "stacked",
              "graph.show_values": true,
            },
          }),
          data: createMockDatasetData({
            cols: [categoryColumn, sourceColumn, metricColumns[0]],
            rows: FOLDED_CATEGORIES.flatMap((category) => [
              [category, "A", 10],
              [category, "B", 7],
            ]),
          }),
        },
      ]);

      // Labels render twice: an outline stroke and the fill.
      expect(
        screen.getAllByText(String(getFoldedRowCount() * 17)).length,
      ).toBeGreaterThan(0);
    });
  });

  it("keeps the dimension axis title inside the chart with more than one metric", () => {
    renderRowChart(createGroupedRowSeries({ metricCount: 2 }));

    const [title] = getTextAnchors("Category");
    expect(title.x - AXIS_TITLE_FONT_SIZE / 2).toBeGreaterThanOrEqual(0);
  });

  it("keeps the metric axis title inside the chart when the dimension title is hidden", () => {
    renderRowChart(
      createGroupedRowSeries({
        metricCount: 1,
        settings: { "graph.x_axis.labels_enabled": false },
      }),
    );

    const [title] = getTextAnchors("Count");
    expect(title.y + AXIS_TITLE_FONT_SIZE / 2).toBeLessThanOrEqual(
      CHART_HEIGHT,
    );
  });

  it("keeps the goal label inside the chart when values are shown", () => {
    renderRowChart(
      createGroupedRowSeries({
        metricCount: 1,
        settings: {
          "graph.show_goal": true,
          "graph.goal_value": 250,
          "graph.goal_label": "Target",
          "graph.show_values": true,
        },
      }),
    );

    const [label] = getTextAnchors("Target");
    expect(label.y - AXIS_TITLE_FONT_SIZE / 2).toBeGreaterThanOrEqual(0);
  });

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
