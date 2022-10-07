import { ColorGetter } from "metabase/static-viz/lib/colors";
import { RowChartTheme } from "metabase/visualizations/shared/components/RowChart/types";

export const getStaticChartTheme = (getColor: ColorGetter): RowChartTheme => {
  return {
    axis: {
      color: getColor("bg-dark"),
      ticks: {
        size: 12,
        weight: 700,
        color: getColor("bg-dark"),
      },
      label: {
        size: 14,
        weight: 700,
        color: getColor("bg-dark"),
      },
    },
    goal: {
      lineStroke: getColor("text-medium"),
      label: {
        size: 14,
        weight: 700,
        color: getColor("text-medium"),
      },
    },
    dataLabels: {
      weight: 700,
      color: getColor("text-dark"),
      size: 12,
    },
    grid: {
      color: getColor("border"),
    },
  };
};
