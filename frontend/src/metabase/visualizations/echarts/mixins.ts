import type { EChartsOption } from "echarts";

import type { VisualizationSettings } from "metabase-types/api";

type EChartsMixin = (params: {
  chartType: any;
  data: any;
  settings: VisualizationSettings;
  option: EChartsOption;
}) => {
  option: EChartsOption;
  eventHandlers?: any;
  zrEventHandlers?: any;
};

export const lineSeriesMixin: EChartsMixin = ({
  chartType,
  data,
  settings,
  option,
}) => {
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

export const smoothSettingMixin: EChartsMixin = ({ settings, option }) => {
  if (Array.isArray(option?.series)) {
    option.series.forEach(series => {
      series.smooth = settings.smooth;
    });
  }

  return { option };
};

export function useEChartsMixins({
  chartType,
  data,
  settings,
  mixins,
}: {
  chartType: any;
  data: any;
  settings: VisualizationSettings;
  mixins: EChartsMixin[];
}) {
  return mixins.reduce(
    (currentOption: EChartsOption, currentMixin) =>
      currentMixin({
        chartType,
        data,
        settings,
        option: currentOption,
      }).option,
    {},
  );
}
