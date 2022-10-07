import { RowChartTheme } from "../types";

const MIN_TICKS_INTERVAL = 160;

export const getXTicksCount = (_theme: RowChartTheme, innerWidth: number) => {
  return Math.max(2, Math.floor(innerWidth / MIN_TICKS_INTERVAL));
};
