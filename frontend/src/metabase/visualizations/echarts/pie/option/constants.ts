import type { RegisteredSeriesOption } from "echarts";

import { DIMENSIONS } from "../constants";

export const SUNBURST_SERIES_OPTION: RegisteredSeriesOption["sunburst"] = {
  type: "sunburst",
  sort: undefined,
  nodeClick: false,
  label: {
    rotate: 0,
    overflow: "none",
    fontSize: 20, // placeholder for ts, it will be overriden later
    fontWeight: DIMENSIONS.slice.label.fontWeight,
  },
  labelLayout: {
    hideOverlap: true,
  },
};
