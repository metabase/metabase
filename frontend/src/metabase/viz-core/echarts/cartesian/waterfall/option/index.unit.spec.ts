import type { DatasetColumn } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../../shared/utils/theme";
import type { RenderingContext } from "../../../../types";
import { X_AXIS_DATA_KEY, X_AXIS_POSITION_KEY } from "../../constants/dataset";
import { CHART_STYLE } from "../../constants/style";
import { getChartLayout } from "../../layout";
import {
  WATERFALL_END_KEY,
  WATERFALL_START_KEY,
  WATERFALL_TOTAL_KEY,
} from "../constants";
import { getWaterfallChartModel } from "../model";

import { buildEChartsWaterfallSeries } from ".";

const renderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: (text) => text.length * 8,
  measureTextHeight: () => 13,
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const setup = (isDashboard: boolean) => {
  const settings = createMockVisualizationSettings({
    "graph.dimensions": ["category"],
    "graph.metrics": ["count"],
    "graph.x_axis.scale": "ordinal",
    "graph.x_axis.axis_enabled": true,
    "graph.y_axis.scale": "linear",
    "graph.y_axis.axis_enabled": true,
    "graph.y_axis.auto_range": true,
    "waterfall.show_total": true,
    column: (column: DatasetColumn) => ({ column }),
    series: () => ({ display: "waterfall" }),
  });
  const model = getWaterfallChartModel(
    [
      {
        card: createMockCard({ id: 1, display: "waterfall" }),
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "category", base_type: "type/Text" }),
            createMockColumn({ name: "count", base_type: "type/Integer" }),
          ],
          rows: [
            ["A", 10],
            ["B", -5],
          ],
        }),
      },
    ],
    settings,
    [],
    renderingContext,
    undefined,
    isDashboard ? { width: 8, height: 6 } : undefined,
  );
  const layout = getChartLayout(
    model,
    settings,
    false,
    400,
    300,
    renderingContext,
  );
  const series = buildEChartsWaterfallSeries(
    model,
    settings,
    layout,
    400,
    model.waterfallLabelFormatter,
    renderingContext,
  );

  return { model, layout, series };
};

describe("waterfall X-axis encoding", () => {
  it("uses fitted category positions and bar widths for bars, labels and Total", () => {
    const { layout, series } = setup(true);

    expect(layout.dashboardXAxis).toBeDefined();
    expect(layout.xAxisMarkWidthRatio).toBe(CHART_STYLE.series.barWidth);
    expect(series.map((entry) => entry.encode?.x)).toEqual([
      X_AXIS_POSITION_KEY,
      X_AXIS_POSITION_KEY,
      X_AXIS_POSITION_KEY,
    ]);
    expect(series[0]).toMatchObject({
      type: "custom",
      dimensions: [X_AXIS_POSITION_KEY, WATERFALL_START_KEY, WATERFALL_END_KEY],
    });
    expect(series[2]).toMatchObject({
      id: WATERFALL_TOTAL_KEY,
      barWidth:
        (layout.dashboardXAxis?.step ?? 0) * CHART_STYLE.series.barWidth,
    });
  });

  it("preserves native category widths and encoding outside dashboards", () => {
    const { model, layout, series } = setup(false);

    expect(layout.dashboardXAxis).toBeUndefined();
    expect(series.map((entry) => entry.encode?.x)).toEqual([
      X_AXIS_DATA_KEY,
      X_AXIS_DATA_KEY,
      X_AXIS_DATA_KEY,
    ]);
    expect(series[2]).toMatchObject({
      barWidth:
        (layout.boundaryWidth / model.dataset.length + 2) *
        CHART_STYLE.series.barWidth,
    });
  });
});
