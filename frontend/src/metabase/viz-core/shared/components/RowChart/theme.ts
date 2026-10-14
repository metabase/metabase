import type { ColorGetter } from "metabase/ui/colors/types";

import type { RowChartTheme } from "./types";

export const getStaticChartTheme = (
  getColor: ColorGetter,
  fontFamily = "Lato",
): RowChartTheme => {
  return {
    axis: {
      color: getColor("border-neutral"),
      ticks: {
        size: 12,
        weight: 700,
        color: getColor("text-secondary"),
        family: fontFamily,
      },
      label: {
        size: 14,
        weight: 700,
        color: getColor("text-secondary"),
        family: fontFamily,
      },
    },
    goal: {
      lineStroke: getColor("icon-primary"),
      lineShadowStroke: getColor("background_surface-primary"),
      label: {
        size: 14,
        weight: 700,
        color: getColor("text-secondary"),
        family: fontFamily,
      },
      marker: {
        iconColor: getColor("icon-primary"),
        backgroundColor: getColor("background_surface-primary"),
        hoverBackgroundColor: getColor("background_surface-primary-hover"),
        shadowColor: getColor("shadow-default"),
      },
    },
    dataLabels: {
      weight: 700,
      color: getColor("text-primary"),
      size: 12,
      family: fontFamily,
    },
    grid: {
      color: getColor("border-neutral"),
    },
  };
};
