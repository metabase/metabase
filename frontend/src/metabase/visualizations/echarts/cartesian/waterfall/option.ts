import type { RegisteredSeriesOption } from "echarts";
import type {
  ChartDataset,
  DataKey,
  SeriesModel,
  XAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import {
  buildEChartsLabelOptions,
  getBarLabelLayout,
  getDataLabelFormatter,
} from "metabase/visualizations/echarts/cartesian/option/series";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import {
  WATERFALL_END_2_KEY,
  WATERFALL_END_KEY,
  WATERFALL_START_2_KEY,
  WATERFALL_START_KEY,
  WATERFALL_TOTAL_KEY,
  WATERFALL_VALUE_KEY,
} from "metabase/visualizations/echarts/cartesian/waterfall/constants";

type WaterfallSeriesOptions =
  | RegisteredSeriesOption["bar"]
  | RegisteredSeriesOption["candlestick"];

const barWidth = "60%";

export const buildEChartsWaterfallSeries = (
  seriesModel: SeriesModel,
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  yAxisIndex: number,
  xAxisModel: XAxisModel,
  renderingContext: RenderingContext,
): WaterfallSeriesOptions[] => {
  const buildLabelOption = (key: DataKey) => ({
    ...buildEChartsLabelOptions(
      seriesModel,
      settings,
      renderingContext,
      settings["graph.show_values"],
    ),
    formatter: getDataLabelFormatter(
      seriesModel,
      settings,
      key,
      renderingContext,
    ),
  });

  const series: WaterfallSeriesOptions[] = [
    {
      id: seriesModel.dataKey,
      type: "candlestick",
      itemStyle: {
        color: settings["waterfall.increase_color"],
        color0: settings["waterfall.decrease_color"],
        borderColor: settings["waterfall.increase_color"],
        borderColor0: settings["waterfall.decrease_color"],
      },
      barWidth,
      dimensions: [
        X_AXIS_DATA_KEY,
        WATERFALL_START_KEY,
        WATERFALL_END_KEY,
        WATERFALL_START_2_KEY,
        WATERFALL_END_2_KEY,
      ],
      encode: {
        x: X_AXIS_DATA_KEY,
        y: [
          WATERFALL_START_KEY,
          WATERFALL_END_KEY,
          WATERFALL_START_2_KEY,
          WATERFALL_END_2_KEY,
        ],
      },
      zlevel: CHART_STYLE.series.zIndex,
      yAxisIndex,
    },
    {
      id: "waterfall_bar_label",
      type: "bar",
      zlevel: CHART_STYLE.series.zIndex + 10,
      silent: true,
      stack: "waterfall",
      dimensions: [X_AXIS_DATA_KEY, WATERFALL_VALUE_KEY, WATERFALL_END_KEY],
      itemStyle: {
        color: "transparent",
      },
      emphasis: {
        itemStyle: undefined,
      },
      barWidth,
      labelLayout: params => {
        const { dataIndex, rect } = params;
        if (dataIndex == null) {
          return {};
        }

        const datum = dataset[dataIndex];
        const value = datum[WATERFALL_VALUE_KEY] ?? 0;
        const end = datum[WATERFALL_END_KEY] ?? 0;
        const isIncrease = value >= 0;

        const verticalAlignOffset =
          CHART_STYLE.seriesLabels.size / 2 + CHART_STYLE.seriesLabels.offset;

        const barHeight = rect.height;
        const endSign = end < 0 ? 1 : -1;
        let labelOffset = (endSign * barHeight) / 2;
        labelOffset += isIncrease ? -verticalAlignOffset : verticalAlignOffset;

        return {
          hideOverlap: settings["graph.label_value_frequency"] === "fit",
          dy: labelOffset,
        };
      },
      encode: {
        y: WATERFALL_END_KEY,
        x: X_AXIS_DATA_KEY,
      },
      label: buildLabelOption(WATERFALL_VALUE_KEY),
    },
  ];

  if (settings["waterfall.show_total"]) {
    series.push({
      id: "waterfall_total_label",
      type: "bar",
      stack: "waterfall",
      barWidth,
      zlevel: CHART_STYLE.series.zIndex + 10,
      dimensions: [X_AXIS_DATA_KEY, WATERFALL_TOTAL_KEY],
      encode: {
        y: WATERFALL_TOTAL_KEY,
        x: X_AXIS_DATA_KEY,
      },
      itemStyle: {
        color: settings["waterfall.total_color"],
      },
      labelLayout: getBarLabelLayout(dataset, settings, WATERFALL_TOTAL_KEY),
      label: buildLabelOption(WATERFALL_TOTAL_KEY),
    });
  }

  return series;
};
