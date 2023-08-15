import type { EChartsOption } from "echarts";

import { VisualizationProps } from "../types";

const MOCK_TOOLTIP_DATA = {
  index: 3,
  event: {
    isTrusted: true,
  },
  stackedTooltipModel: {
    headerTitle: "Total",
    headerRows: [
      {
        name: "80  –  100",
        value: 65,
        color: "#EF8C8C",
      },
    ],
    bodyRows: [
      {
        name: "20  –  40",
        value: 94,
        color: "#98D9D9",
      },
      {
        name: "40  –  60",
        value: 77,
        color: "#F9D45C",
      },
      {
        name: "60  –  80",
        value: 52,
        color: "#A989C5",
      },
      {
        name: "Other",
        value: 10,
        color: "#949AAB",
      },
    ],
    showTotal: true,
    showPercentages: true,
  },
};

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

export const lineSeriesMixin: EChartsMixin = ({ option }) => {
  // TODO real implementation
  return {
    option: {
      ...option,
      xAxis: {
        type: "category",
        data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      },
      yAxis: {
        type: "value",
      },
      series: [
        {
          name: "Some Series Name",
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

export const tooltipMixin: EChartsMixin = ({
  props: { onHoverChange },
  option,
}) => {
  return {
    option,
    eventHandlers: [
      {
        eventName: "mouseover",
        handler: e => {
          // TODO real implementation
          onHoverChange?.({
            ...MOCK_TOOLTIP_DATA,
            event: e.event.event?.nativeEvent,
            element: e.event.event?.target,
          });
        },
      },
      {
        eventName: "mouseout",
        handler: () => onHoverChange?.(undefined),
      },
    ],
  };
};

export const legendMixin: EChartsMixin = ({ option }) => {
  // TODO real implementation
  option.legend = {
    show: true,
  };

  return { option };
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
