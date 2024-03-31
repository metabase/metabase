import type { RowChartTheme } from "metabase/visualizations/shared/components/RowChart/types";
import type { ColorGetter } from "metabase/visualizations/types";

export const getStaticChartTheme = (
  getColor: ColorGetter,
  fontFamily = "Lato",
): RowChartTheme => {
  return {
    axis: {
      color: getColor("border"),
      ticks: {
        size: 12,
        weight: 700,
        color: getColor("bg-dark"),
        family: fontFamily,
      },
      label: {
        size: 14,
        weight: 700,
        color: getColor("bg-dark"),
        family: fontFamily,
      },
    },
    goal: {
      lineStroke: getColor("text-medium"),
      label: {
        size: 14,
        weight: 700,
        color: getColor("text-medium"),
        family: fontFamily,
      },
    },
    dataLabels: {
      weight: 700,
      color: getColor("text-dark"),
      size: 12,
      family: fontFamily,
    },
    grid: {
      color: getColor("border"),
    },
  };
};
