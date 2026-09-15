import type {
  CardDisplayType,
  DatasetColumn,
  RawSeries,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

const categoryColumn = createMockColumn({
  name: "category",
  display_name: "Category",
  base_type: "type/Text",
  source: "breakout",
});
const countColumn = createMockColumn({
  name: "count",
  display_name: "Count",
  base_type: "type/Integer",
  semantic_type: "type/Quantity",
  source: "aggregation",
});

function createSeries(
  display: CardDisplayType,
  rows: RowValue[][],
  columns: DatasetColumn[] = [categoryColumn, countColumn],
  settings: VisualizationSettings = {},
): RawSeries {
  return [
    {
      card: createMockCard({
        display,
        visualization_settings: {
          "graph.dimensions": [columns[0].name],
          "graph.metrics": columns.slice(1).map((column) => column.name),
          "graph.x_axis.scale": "ordinal",
          "graph.x_axis.axis_enabled": true,
          "graph.y_axis.axis_enabled": true,
          "graph.x_axis.labels_enabled": false,
          "graph.y_axis.labels_enabled": false,
          "graph.show_values": false,
          ...settings,
        },
      }),
      data: createMockDatasetData({ cols: columns, rows }),
    },
  ];
}

const categoryRows: RowValue[][] = [
  ["Alabama", 1200],
  ["Alaska", 800],
  ["Arizona", 1600],
  ["New Hampshire", 1000],
];
const groupedRows: RowValue[][] = categoryRows.map(([name, value], index) => [
  name,
  value,
  (index + 1) * 300,
]);
const groupedColumns = [
  categoryColumn,
  countColumn,
  createMockColumn({
    ...countColumn,
    name: "completed",
    display_name: "Completed",
  }),
];
const quarterColumn = createMockColumn({
  name: "quarter",
  display_name: "Quarter",
  base_type: "type/DateTime",
  source: "breakout",
  unit: "quarter",
});
const quarterRows: RowValue[][] = [
  ["2025-01-01T00:00:00", 1200],
  ["2025-04-01T00:00:00", 800],
  ["2025-07-01T00:00:00", 1600],
  ["2025-10-01T00:00:00", 1000],
];
const histogramColumn = createMockColumn({
  name: "bucket",
  display_name: "Bucket",
  base_type: "type/Integer",
  source: "breakout",
  binning_info: {
    bin_width: 10,
    min_value: 0,
    max_value: 40,
    num_bins: 4,
    binning_strategy: "bin-width",
  },
});

function createBubbleSeries(sizes: number[]): RawSeries {
  const sizeColumn = createMockColumn({
    ...countColumn,
    name: "size",
    display_name: "Size",
  });
  return createSeries(
    "scatter",
    sizes.map((size, index) => [
      String.fromCharCode(65 + index),
      20 + index * 10,
      size,
    ]),
    [categoryColumn, countColumn, sizeColumn],
    {
      "graph.metrics": ["count"],
      "scatter.bubble": "size",
      "graph.y_axis.auto_range": false,
      "graph.y_axis.min": 0,
      "graph.y_axis.max": 100,
    },
  );
}

export const axisPaddingSeries = {
  twoBars: createSeries("bar", [categoryRows[0], categoryRows[3]]),
  fourBars: createSeries("bar", categoryRows),
  groupedBars: createSeries("bar", groupedRows, groupedColumns, {
    "stackable.stack_type": null,
  }),
  stackedBars: createSeries("bar", groupedRows, groupedColumns, {
    "stackable.stack_type": "stacked",
  }),
  line: createSeries("line", quarterRows, [quarterColumn, countColumn], {
    "graph.x_axis.scale": "timeseries",
  }),
  area: createSeries("area", quarterRows, [quarterColumn, countColumn], {
    "graph.x_axis.scale": "timeseries",
  }),
  scatter: createSeries("scatter", [
    ["Alabama", 1200],
    ["New Hampshire", 800],
    ["Alabama", 1600],
    ["New Hampshire", 1000],
  ]),
  largeEndpointBubble: createBubbleSeries([100, 40, 0]),
  largeMiddleBubble: createBubbleSeries([0, 100, 0]),
  waterfall: createSeries(
    "waterfall",
    [
      ["Opening", 1200],
      ["Income", 800],
      ["Expenses", -1000],
    ],
    undefined,
    { "waterfall.show_total": true },
  ),
  histogram: createSeries(
    "bar",
    [
      [0, 12],
      [10, 8],
      [20, 16],
      [30, 10],
    ],
    [histogramColumn, countColumn],
    { "graph.x_axis.scale": "histogram" },
  ),
  boxplot: createSeries(
    "boxplot",
    ["Alabama", "New Hampshire"].flatMap((category) =>
      [5, 10, 15, 20, 100].map((value) => [category, value]),
    ),
    undefined,
    { "boxplot.points_mode": "all", "boxplot.whisker_type": "tukey" },
  ),
};
