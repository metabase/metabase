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
import type { RegisteredSeriesOption } from "echarts";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import {
  buildEChartsLabelOptions,
  getBarLabelLayout,
} from "metabase/visualizations/echarts/cartesian/option/series";
import dayjs from "dayjs";

const getXValuesCount = (
  dataset: ChartDataset,
  dimensionDataKey: DataKey,
  unit: string,
  settings: ComputedVisualizationSettings,
) => {
  if (settings["graph.x_axis.scale"] === "ordinal") {
    return dataset.length;
  }
  return Math.abs(
    dayjs(dataset[0][dimensionDataKey]).diff(
      dayjs(dataset[dataset.length - 1][dimensionDataKey]),
      unit,
    ),
  );
};

export const buildEChartsWaterfallSeries = (
  seriesModel: SeriesModel,
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  dimensionDataKey: string,
  yAxisIndex: number,
  xAxisModel: XAxisModel,
  renderingContext: RenderingContext,
): (RegisteredSeriesOption["bar"] | RegisteredSeriesOption["custom"])[] => {
  const xValuesCount = getXValuesCount(
    dataset,
    dimensionDataKey,
    xAxisModel.timeSeriesInterval?.interval,
    settings,
  );
  return [
    {
      id: seriesModel.dataKey,
      emphasis: {
        focus: "self",
        itemStyle: {
          color: seriesModel.color,
        },
      },
      blur: {
        label: {
          show: settings["graph.show_values"],
        },
        itemStyle: {
          opacity: 0.3,
        },
      },
      type: "custom",
      clip: true,
      renderItem: (params, api) => {
        const dataIndex = api.value(0);
        const barStart = api.value(1);
        const barEnd = api.value(2);
        const isTotal = api.value(3);

        const barWidth = (params.coordSys.width / xValuesCount) * 0.7;

        const startCoord = api.coord([dataIndex, barStart]);
        const endCoord = api.coord([dataIndex, barEnd]);
        let rectHeight = startCoord[1] - endCoord[1];

        const isIncrease = barEnd >= barStart;

        const style = api.style();
        if (isTotal) {
          style.fill = settings["waterfall.total_color"];
        } else if (isIncrease) {
          style.fill = settings["waterfall.increase_color"];
        } else {
          style.fill = settings["waterfall.decrease_color"];
        }

        api.font({
          fontFamily: renderingContext.fontFamily,
          fontSize: CHART_STYLE.seriesLabels.size,
          fontWeight: CHART_STYLE.seriesLabels.weight,
        });

        return {
          type: "rect",
          shape: {
            x: endCoord[0] - barWidth / 2,
            y: endCoord[1],
            width: barWidth,
            height: rectHeight,
          },
          style,
        };
      },
      zlevel: CHART_STYLE.series.zIndex,
      yAxisIndex,
      barGap: 0,
      dimensions: [dimensionDataKey, "start", "end", "isTotal"],
      encode: {
        y: "end",
        x: dimensionDataKey,
      },
    },
    {
      id: "waterfall_bar_label",
      type: "bar",
      zlevel: CHART_STYLE.series.zIndex - 1,
      silent: true,
      itemStyle: {
        color: "transparent",
      },
      labelLayout: getBarLabelLayout(dataset, settings, seriesModel.dataKey),
      encode: {
        y: "end",
        x: dimensionDataKey,
      },
      label: buildEChartsLabelOptions(
        seriesModel,
        settings,
        renderingContext,
        true,
      ),
    },
  ];
};
