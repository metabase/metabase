import type { RegisteredSeriesOption } from "echarts";
import { t } from "ttag";

export const SUNBURST_SERIES_OPTION: RegisteredSeriesOption["sunburst"] = {
  type: "sunburst",
  sort: undefined,
  label: {
    rotate: 0,
    overflow: "none",
    lineHeight: 50, // TODO update this later
    fontSize: 16, // TODO update this later
    color: "white", // TODO select color dynamically based on contrast with slice color
  },
  radius: ["60%", "90%"], // TODO compute this dynamically based on side length like in PieChart.jsx
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
      top: 25, // TODO confirm this and other style values later
      style: {
        fontSize: "14px",
        fontWeight: "700",
        textAlign: "center",
        text: t`Total`.toUpperCase(),
      },
    },
  ],
};
