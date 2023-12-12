import type { RegisteredSeriesOption } from "echarts/types/dist/shared";

export function buildEChartsWaterfallSeries(): RegisteredSeriesOption["bar"] {
  return {
    type: "bar",
    encode: {
      y: "increase",
      x: "dimension",
    },
  };
}
