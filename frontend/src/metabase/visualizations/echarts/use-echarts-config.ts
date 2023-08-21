import type { EChartsConfig, EChartsMixin, VisualizationProps } from "../types";

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
