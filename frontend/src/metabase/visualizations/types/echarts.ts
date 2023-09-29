import type { EChartsOption } from "echarts";

import { VisualizationProps } from "./visualization";

export type EChartsEventHandler = {
  // TODO better types
  eventName: string;
  query?: string;
  handler: (event: any) => void;
};

export type ZREventHandler = {
  // TODO better types
  eventName: string;
  handler: (event: any) => void;
};

export type EChartsConfig = {
  option: EChartsOption;
  eventHandlers: EChartsEventHandler[];
  zrEventHandlers: ZREventHandler[];
};

export type EChartsMixin = (params: {
  chartType: any; // TODO better type
  props: VisualizationProps;
  option: EChartsOption;
}) => {
  option: EChartsOption;
  eventHandlers?: EChartsEventHandler[];
  zrEventHandlers?: ZREventHandler[];
};
