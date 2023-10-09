import type { EChartsOption } from "echarts";
import type {
  ComputedVisualizationSettings,
  EChartsEventHandler,
} from "metabase/visualizations/types";

import type { RawSeries } from "metabase-types/api";

import { transformMultipleCards } from "metabase/visualizations/shared/echarts/combo/data";
import { color } from "metabase/lib/colors";

const getXAxisType = (settings: ComputedVisualizationSettings) => {
  switch (settings["graph.x_axis.scale"]) {
    case "timeseries":
      return "time";
    case "linear":
      return "value";
    default:
      // TODO: implement histogram
      return "category";
  }
};

export const buildComboChart = (
  multipleSeries: RawSeries,
  settings: ComputedVisualizationSettings,
): {
  option: EChartsOption;
  eventHandlers: EChartsEventHandler[];
} => {
  const { cardModels, eChartsSeries } = transformMultipleCards(
    multipleSeries,
    settings,
  );

  const dataset = cardModels.map(model => {
    const dimensions = [
      model.cardSeries.xSeries.seriesKey,
      ...model.cardSeries.yMultiSeries.map(s => s.seriesKey),
    ];
    return { source: model.dataset, dimensions };
  });

  const option = {
    dataset,
    yAxis: {
      axisLabel: {
        hideOverlap: true,
        color: color("text-dark"),
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "Lato",
      },
    },
    xAxis: {
      type: getXAxisType(settings),
      axisLabel: {
        hideOverlap: true,
        color: color("text-dark"),
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "Lato",
      },
      axisLine: {
        lineStyle: {
          color: color("text-dark"),
        },
      },
    },
    series: eChartsSeries,
  };

  console.log(">>>op", option);

  return {
    option,
    eventHandlers: [],
  };
};
