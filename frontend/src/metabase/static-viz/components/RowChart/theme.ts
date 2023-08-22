import type { ColorGetter } from "metabase/static-viz/lib/colors";
import type { RowChartTheme } from "metabase/visualizations/shared/components/RowChart/types";

export const getStaticChartTheme = (
  getColor: ColorGetter,
  fontFamily = "Lato",
): RowChartTheme => {
  return {
    axis: {
      color: getColor("bg-dark"),
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
