import type { ColorGetter } from "metabase/ui/colors/types";
import type { RowChartTheme } from "metabase/visualizations/shared/components/RowChart/types";

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
        color: getColor("background-tertiary-inverse"),
        family: fontFamily,
      },
      label: {
        size: 14,
        weight: 700,
        color: getColor("background-tertiary-inverse"),
        family: fontFamily,
      },
    },
    goal: {
      lineStroke: getColor("text-secondary"),
      label: {
        size: 14,
        weight: 700,
        color: getColor("text-secondary"),
        family: fontFamily,
      },
    },
    dataLabels: {
      weight: 700,
      color: getColor("text-primary"),
      size: 12,
      family: fontFamily,
    },
    grid: {
      color: getColor("border"),
    },
  };
};
