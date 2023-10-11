import moment from "moment-timezone";
import type { EChartsOption } from "echarts";
import type {
  ComputedVisualizationSettings,
  EChartsEventHandler,
  RenderingEnvironment,
} from "metabase/visualizations/types";

import type { RawSeries } from "metabase-types/api";

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
  onHoverChange?: any,
  hovered: any,
  onVisualizationClick?: any,
): {
  option: EChartsOption;
  eventHandlers: EChartsEventHandler[];
} => {
  const { getColor } = environment;
  const { cardModels, eChartsSeries } = transformMultipleCards(
    multipleSeries,
    settings,
    environment,
  );

  const dataset = cardModels.map(model => {
    const dimensions = [
      model.cardSeries.xSeries.seriesKey,
      ...model.cardSeries.yMultiSeries.map(s => s.seriesKey),
    ];
    return { source: model.dataset, dimensions };
  });

  const xAxisFormatter = (value: unknown) => {
    const column = cardModels[0].cardSeries.xSeries.column;
    return environment.formatValue(value, {
      column,
      ...settings.column(column),
    });
  };

  const yAxisFormatter = (value: unknown) => {
    const column = cardModels[0].cardSeries.yMultiSeries[0]?.column;
    return environment.formatValue(value, {
      column,
      ...settings.column(column),
    });
  };

  const xAxisType = getXAxisType(settings);

  const axisLabelDefaultOption = (name: string, nameGap: number) => ({
    name,
    nameGap,
    nameLocation: "center",
    nameTextStyle: {
      color: getColor("text-dark"),
      fontSize: 14,
      fontWeight: 900,
      fontFamily: "Lato",
    },
  });
  const option = {
    toolbox: {
      show: false,
    },
    brush: {
      toolbox: ["lineX"],
      xAxisIndex: 0,
      throttleType: "debounce",
      throttleDelay: 200,
    },
    dataset,
    yAxis: {
      ...axisLabelDefaultOption(settings["graph.y_axis.title_text"], 40),
      splitLine: {
        lineStyle: {
          type: 5,
          color: getColor("border"),
        },
      },
      axisLabel: {
        hideOverlap: true,
        color: getColor("text-dark"),
        fontSize: 12,
        fontWeight: 900,
        fontFamily: "Lato",
        formatter: (value: string) => {
          return yAxisFormatter(value);
        },
      },
    },
    xAxis: {
      ...axisLabelDefaultOption(settings["graph.x_axis.title_text"], 24),
      axisTick: {
        show: false,
      },
      boundaryGap: [0.02, 0.02],
      splitLine: {
        show: false,
      },
      type: xAxisType,
      axisLabel: {
        hideOverlap: true,
        color: getColor("text-dark"),
        fontSize: 12,
        fontWeight: 900,
        fontFamily: "Lato",
        formatter: (value: string) => {
          const formatted = xAxisFormatter(
            xAxisType === "time"
              ? moment(value).format("YYYY-MM-DDTHH:mm:ssZ")
              : value,
          );

          return ` ${formatted} `;
        },
      },
      axisLine: {
        lineStyle: {
          color: getColor("text-dark"),
        },
      },
    },
    series: eChartsSeries,
  };

  const eventHandlers: EChartsEventHandler[] = [
    {
      eventName: "mouseout",
      handler: () => {
        onHoverChange?.(null);
      },
    },
    {
      eventName: "mousemove",
      handler: event => {
        const data = event.dimensionNames.map(name => {
          const value = event.data[name];

          return {
            key: name,
            value,
            col: cardModels[0].cardSeries.yMultiSeries[0]?.column,
          };
        });
        onHoverChange?.({
          settings,
          index: 0,
          event: event.event.event,
          data,
        });
      },
    },
    {
      eventName: "click",
      handler: event => {
        onVisualizationClick?.({
          event: event.event.event,
          value: 5,
          column: cardModels[0].cardSeries.yMultiSeries[0]?.column,
          data: [],
          dimensions: [
            {
              value: "foo",
              column: cardModels[0].cardSeries.xSeries.column,
            },
          ],
          settings,
        });
      },
    },
  ];

  return {
    option,
    eventHandlers,
  };
};
