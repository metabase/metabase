import { color } from "metabase/lib/colors";
import { RowChartTheme } from "metabase/visualizations/shared/components/RowChart/types";

export const getChartTheme = (fontFamily: string = "Lato"): RowChartTheme => {
  return {
    axis: {
      color: color("text-light"),
      ticks: {
        size: 12,
        weight: 900,
        color: color("text-medium"),
        family: fontFamily,
      },
      label: {
        size: 14,
        weight: 900,
        color: color("text-medium"),
        family: fontFamily,
      },
    },
    goal: {
      lineStroke: color("text-medium"),
      label: {
        size: 14,
        weight: 700,
        color: color("text-medium"),
        family: fontFamily,
      },
    },
    dataLabels: {
      weight: 900,
      color: color("text-dark"),
      size: 12,
      family: fontFamily,
    },
    grid: {
      color: color("border"),
    },
  };
};
