import { STATIC_CHART_TYPES } from "./constants";

type StaticChartType = typeof STATIC_CHART_TYPES[number];

export interface IStaticChartProps {
  type: StaticChartType;
  options: any;
}
