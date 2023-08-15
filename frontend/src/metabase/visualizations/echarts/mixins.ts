import type { EChartsOption } from "echarts";

import { VisualizationProps } from "../types";

type EChartsEventHandler = {
  // TODO better types
  eventName: string;
  query?: string;
  handler: (event: any) => void;
};

type ZREventHandler = {
  // TODO better types
  eventName: string;
  handler: (event: any) => void;
};

export type EChartsConfig = {
  option: EChartsOption;
  eventHandlers: EChartsEventHandler[];
  zrEventHandlers: ZREventHandler[];
};

type EChartsMixin = (params: {
  chartType: any;
  props: VisualizationProps;
  option: EChartsOption;
}) => {
  option: EChartsOption;
  eventHandlers?: EChartsEventHandler[];
  zrEventHandlers?: ZREventHandler[];
};

export const lineSeriesMixin: EChartsMixin = () => {
  return {
    option: {
      xAxis: {
        type: "category",
        data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      },
      yAxis: {
        type: "value",
      },
      series: [
        {
          id: "data",
          data: [150, 230, 224, 218, 135, 147, 260],
          type: "line",
        },
      ],
    },
  };
};

export const smoothSettingMixin: EChartsMixin = ({
  props: { settings },
  option,
}) => {
  if (Array.isArray(option?.series)) {
    option.series.forEach(series => {
      series.smooth = settings.smooth;
    });
  }

  return { option };
};

export const clickActionsMixin: EChartsMixin = ({
  props: { onVisualizationClick, data },
  option,
}) => {
  return {
    option,
    eventHandlers: [
      {
        eventName: "click",
        handler: e => {
          // TODO replace placeholders and add all data needed
          onVisualizationClick({
            event: e.event.event,
            dimensions: [{ value: 1, column: data.cols[0] }],
          });
        },
      },
    ],
  };
};

export function useEChartsConfig({
  chartType,
  props,
  mixins,
}: {
  chartType: any;
  props: VisualizationProps;
  mixins: EChartsMixin[];
}) {
  const emptyConfig: EChartsConfig = {
    option: {},
    eventHandlers: [],
    zrEventHandlers: [],
  };

  return mixins.reduce((currentConfig: EChartsConfig, currentMixin) => {
    const next = currentMixin({
      chartType,
      props,
      option: currentConfig.option,
    });

    return {
      option: next.option,
      eventHandlers: [
        ...currentConfig.eventHandlers,
        ...(next.eventHandlers ?? []),
      ],
      zrEventHandlers: [
        ...currentConfig.zrEventHandlers,
        ...(next.zrEventHandlers ?? []),
      ],
    };
  }, emptyConfig);
}
