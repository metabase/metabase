import type { SunburstSeriesOption } from "echarts";

import type { EChartsMixin } from "metabase/visualizations/types";
import {
  computeLabelDecimals,
  formatPercent,
} from "metabase/visualizations/visualizations/PieChart/utils";
import { formatValue } from "metabase/lib/formatting";
import { getMetricIndex, getSlices } from "./utils";

export const pieSeriesMixin: EChartsMixin = ({ option, props }) => {
  const slices = getSlices({ props });

  option.series = {
    type: "sunburst",
    radius: ["60%", "90%"], // TODO calculate this like we do in PieChart.jsx
    sort: undefined,
    data: slices.map(s => ({
      // TODO fix type error
      value: s.value,
      name: s.key,
      itemStyle: {
        color: s.color,
      },
    })),
  };

  return { option };
};

export const showPercentagesOnChartMixin: EChartsMixin = ({
  option,
  props,
}) => {
  if (props.settings["pie.percent_visibility"] !== "inside") {
    return { option };
  }
  const slices = getSlices({ props });
  const percentages = slices.map(s => s.percentage);
  const labelDecimals = computeLabelDecimals({ percentages });

  (option.series as SunburstSeriesOption).data?.forEach((d, index) => {
    d.label = {
      ...d.label,
      formatter: () =>
        formatPercent({
          percent: percentages[index],
          decimals: labelDecimals ?? 0,
          settings: props.settings,
          cols: props.data.cols,
        }),
    };
  });

  return { option };
};

export const totalMixin: EChartsMixin = ({ option, props }) => {
  // add this in a new commit

  // a different branch
  if (!props.settings["pie.show_total"]) {
    return { option };
  }

  const metricIndex = getMetricIndex(props);
  const total = props.data.rows.reduce((sum, row) => sum + row[metricIndex], 0);
  const formattedTotal = formatValue(total, {
    ...props.settings.column?.(props.data.cols[metricIndex]),
    jsx: true,
    majorWidth: 0,
  });

  option.graphic = {
    type: "group",
    top: "center",
    left: "center",
    children: [
      {
        type: "text",
        cursor: "text",
        // TODO styles
        style: {
          fill: "#000",
          font: "bold 26px sans-serif",
          textAlign: "center",
          text: formattedTotal,
        },
      },
      {
        type: "text",
        cursor: "text",
        top: 25,
        // TODO styles
        style: {
          fill: "#000",
          font: "bold 26px sans-serif",
          textAlign: "center",
          text: "Total",
        },
      },
    ],
  };

  return { option };
};
