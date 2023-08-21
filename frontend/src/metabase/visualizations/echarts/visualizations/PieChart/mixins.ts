import type { EChartsMixin } from "metabase/visualizations/types";

export const pieSeriesMixin: EChartsMixin = ({ option, props }) => {
  option.series = {
    type: "sunburst",
    radius: ["60%", "90%"], // TODO calculate this like we do in PieChart.jsx
    data: props.data.rows.map(r => ({
      // TODO fix type error
      value: r[props.settings["pie._metricIndex"]] ?? undefined,
      name: r[props.settings["pie._dimensionIndex"]] ?? undefined,
    })),
  };

  return { option };
};
