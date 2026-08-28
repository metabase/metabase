import type { EChartsSeriesMouseEvent } from "../types";

type TreePathInfo = {
  name: string;
  dataIndex: number;
  value: number;
};

export type EChartsSunburstSeriesMouseEvent = EChartsSeriesMouseEvent & {
  treePathInfo: TreePathInfo[];
};
