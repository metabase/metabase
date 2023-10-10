import type { EChartsOption } from "echarts";
import moment from "moment";
import type {
  ComputedVisualizationSettings,
  EChartsEventHandler,
  RenderingEnvironment,
} from "metabase/visualizations/types";

import type { RawSeries, TimelineEvent } from "metabase-types/api";

import { transformMultipleCards } from "metabase/visualizations/shared/echarts/combo/data";

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
  environment: RenderingEnvironment,
  timelineEvents?: TimelineEvent[],
  onSelectTimelineEvents?: (events: TimelineEvent[]) => void,
  onOpenTimelines?: () => void,
): {
  option: EChartsOption;
  eventHandlers: EChartsEventHandler[];
} => {
  const { getColor } = environment;
  const { cardModels, eChartsSeries } = transformMultipleCards(
    multipleSeries,
    settings,
    environment,
    timelineEvents,
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
        color: getColor("text-dark"),
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "Lato",
      },
      splitLine: {
        lineStyle: {
          color: "#ccc",
          type: [5, 5],
          opacity: 0.5,
        },
      },
    },
    xAxis: {
      type: getXAxisType(settings),
      axisLabel: {
        hideOverlap: true,
        color: getColor("text-dark"),
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "Lato",
      },
      axisLine: {
        lineStyle: {
          color: getColor("text-dark"),
        },
      },
      axisTick: {
        show: false,
      },
    },
    series: eChartsSeries,
  };

  return {
    option,
    eventHandlers: [
      {
        eventName: "click",
        handler: e => {
          if (!(e.componentType === "markLine")) {
            return;
          }
          const event = timelineEvents?.find(
            t => e.data.coord[0] === moment(t.timestamp).toISOString(),
          );

          if (event) {
            onSelectTimelineEvents?.([event]);
            onOpenTimelines?.();
          }
        },
      },
    ],
  };
};
