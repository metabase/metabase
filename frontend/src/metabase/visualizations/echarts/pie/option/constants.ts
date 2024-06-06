import type { RegisteredSeriesOption } from "echarts";
import { t } from "ttag";

import { DIMENSIONS } from "../constants";

export const SUNBURST_SERIES_OPTION: RegisteredSeriesOption["sunburst"] = {
  type: "sunburst",
  sort: undefined,
  radius: [DIMENSIONS.innerRadius, DIMENSIONS.outerRadius],
  label: {
    rotate: 0,
    overflow: "none",
    fontSize: 20,
    fontWeight: 700,
  },
  labelLayout: {
    hideOverlap: true,
  },
  itemStyle: {
    borderWidth: DIMENSIONS.slice.borderWidth,
  },
};

export const TOTAL_GRAPHIC_OPTION = {
  type: "group",
  top: "center",
  left: "center",
  children: [
    {
      type: "text",
      cursor: "text",
      style: {
        fontSize: "22px",
        fontWeight: "700",
        textAlign: "center",
        // placeholder values to keep typescript happy
        fontFamily: "",
        fill: "",
      },
    },
    {
      type: "text",
      cursor: "text",
      top: 26,
      style: {
        fontSize: "14px",
        fontWeight: "700",
        textAlign: "center",
        text: t`Total`.toUpperCase(),
      },
    },
  ],
};
