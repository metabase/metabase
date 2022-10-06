import { ChartTheme } from "metabase/visualizations/types/theme";

export const getXTicksCount = (theme: ChartTheme, innerWidth: number) => {
  return Math.max(2, Math.floor(innerWidth / theme.axis.minTicksInterval));
};
