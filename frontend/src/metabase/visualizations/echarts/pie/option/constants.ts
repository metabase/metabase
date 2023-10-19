import type { RegisteredSeriesOption } from "echarts";

export const SUNBURST_SERIES_OPTIONS: RegisteredSeriesOption["sunburst"] = {
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
