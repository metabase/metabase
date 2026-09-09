import type { DatasetColumn, SingleSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
  VisualizationGridSize,
} from "../../../types";
import { getScatterPlotModel } from "../scatter/model";
import { getWaterfallChartModel } from "../waterfall/model";

import { getCardsReferencedColumns, getCartesianChartModel } from "./index";

describe.each([
  { display: "bar", getModel: getCartesianChartModel },
  { display: "scatter", getModel: getScatterPlotModel },
  { display: "waterfall", getModel: getWaterfallChartModel },
] as const)("$display chart label formatting", ({ display, getModel }) => {
  const renderingContext: RenderingContext = {
    getColor: (name) => name,
    measureText: () => 10,
    measureTextHeight: () => 10,
    fontFamily: "",
    theme: DEFAULT_VISUALIZATION_THEME,
  };

  const buildModel = (
    formatting: "auto" | "compact" | "full" | undefined,
    gridSize?: VisualizationGridSize,
    showValues = false,
    extraSettings: Partial<ComputedVisualizationSettings> = {},
  ) => {
    const dimensionColumn = createMockColumn({
      name: "bucket",
      base_type: "type/Integer",
    });
    const metricColumn = createMockColumn({
      name: "count",
      base_type: "type/Integer",
      semantic_type: "type/Quantity",
    });

    return getModel(
      [
        {
          card: createMockCard({ id: 1, display }),
          data: createMockDatasetData({
            cols: [dimensionColumn, metricColumn],
            rows: [
              [1, 1000],
              [2, 2000],
            ],
          }),
        },
      ],
      createMockVisualizationSettings({
        "graph.dimensions": [dimensionColumn.name],
        "graph.metrics": [metricColumn.name],
        "graph.x_axis.scale": "ordinal",
        "graph.y_axis.scale": "linear",
        "graph.label_value_formatting": formatting,
        "graph.show_values": showValues,
        column: (column: DatasetColumn) => ({ column }),
        series: () => ({ display, show_series_values: true }),
        ...extraSettings,
      }),
      [],
      renderingContext,
      undefined,
      gridSize,
    );
  };

  it.each(["auto", "compact", undefined] as const)(
    "uses compact dashboard axis labels with %s formatting",
    (formatting) => {
      const model = buildModel(formatting, { width: 8, height: 6 });

      expect(model.leftAxisModel?.formatter(1000)).toBe("1.0k");
      expect(model.leftAxisModel?.formatGoal(1000)).toBe("1,000");
    },
  );

  it("preserves explicit full formatting on dashboards", () => {
    const model = buildModel("full", { width: 8, height: 6 }, true);

    expect(model.leftAxisModel?.formatter(1000)).toBe("1,000");
  });

  it.each([false, true])(
    "preserves automatic formatting outside dashboards with show values set to %s",
    (showValues) => {
      const model = buildModel("auto", undefined, showValues);

      expect(model.leftAxisModel?.formatter(1000)).toBe("1,000");
    },
  );

  it("preserves explicit compact formatting outside dashboards", () => {
    const model = buildModel("compact");

    expect(model.leftAxisModel?.formatter(1000)).toBe("1.0k");
  });

  if (display !== "scatter") {
    it.each([
      { formatting: "auto", expected: "1.0k" },
      { formatting: "compact", expected: "1.0k" },
      { formatting: "full", expected: "1,000" },
    ] as const)(
      "uses $formatting formatting for dashboard data labels",
      ({ formatting, expected }) => {
        const model = buildModel(formatting, { width: 8, height: 6 }, true);
        const formatter =
          "waterfallLabelFormatter" in model
            ? model.waterfallLabelFormatter
            : model.seriesLabelsFormatters[model.seriesModels[0].dataKey];

        expect(formatter?.(1000)).toBe(expected);
      },
    );
  }

  if (display === "bar") {
    it("uses compact dashboard stack totals with automatic formatting", () => {
      const model = buildModel("auto", { width: 8, height: 6 }, true, {
        "stackable.stack_type": "stacked",
        "graph.show_stack_values": "total",
      });

      const formatter =
        "stackedLabelsFormatters" in model
          ? model.stackedLabelsFormatters.bar
          : undefined;

      expect(formatter?.(1000)).toBe("1.0k");
    });
  }
});

describe("getCardsReferencedColumns", () => {
  const dimensionA = createMockColumn({
    name: "created_at",
    base_type: "type/DateTime",
    source: "breakout",
  });
  const metricA = createMockColumn({
    name: "count",
    base_type: "type/Integer",
    source: "aggregation",
  });
  const extraA = createMockColumn({ name: "extra_a" });
  const dimensionB = createMockColumn({
    name: "category",
    base_type: "type/Text",
    source: "breakout",
  });
  const metricB = createMockColumn({
    name: "sum",
    base_type: "type/Integer",
    source: "aggregation",
  });
  const extraB = createMockColumn({ name: "extra_b" });

  const cardA: SingleSeries = {
    card: createMockCard({
      id: 1,
      visualization_settings: {
        "graph.dimensions": ["created_at"],
        "graph.metrics": ["count"],
      },
    }),
    data: createMockDatasetData({
      cols: [dimensionA, metricA, extraA],
      rows: [["2024", 1, "x"]],
    }),
  };
  const cardB: SingleSeries = {
    card: createMockCard({
      id: 2,
      visualization_settings: {
        "graph.dimensions": ["category"],
        "graph.metrics": ["sum"],
      },
    }),
    data: createMockDatasetData({
      cols: [dimensionB, metricB, extraB],
      rows: [["a", 2, "y"]],
    }),
  };

  it("uses the passed-in settings for a single-card series", () => {
    const settings: ComputedVisualizationSettings = {
      "graph.dimensions": ["created_at"],
      "graph.metrics": ["count"],
    };
    expect(getCardsReferencedColumns([cardA], settings)).toEqual([
      [dimensionA, metricA],
    ]);
  });

  it("uses each card's own visualization_settings when multiple cards are combined", () => {
    // Computed settings only reflect the first card, but each card needs to
    // resolve against its own stored settings so referenced columns are
    // correct per card.
    const computedSettings: ComputedVisualizationSettings = {
      "graph.dimensions": ["created_at"],
      "graph.metrics": ["count"],
    };
    expect(getCardsReferencedColumns([cardA, cardB], computedSettings)).toEqual(
      [
        [dimensionA, metricA],
        [dimensionB, metricB],
      ],
    );
  });
});
