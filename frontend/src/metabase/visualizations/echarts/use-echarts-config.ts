import type { EChartsConfig, EChartsMixin, IsomorphicVizProps } from "../types";

export function useEChartsConfig({
  chartType,
  props,
  mixins,
}: {
  chartType: any;
  props: IsomorphicVizProps;
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
