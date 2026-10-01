import { useMemo } from "react";

import { useMantineTheme } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import { type RowChartTheme, getVisualizationTheme } from "metabase/viz-core";

export const useRowChartTheme = (
  fontFamily: string = "Lato",
  isDashboard: boolean,
): RowChartTheme => {
  const theme = useMantineTheme();

  return useMemo(() => {
    const { cartesian } = getVisualizationTheme({
      theme: theme.other,
      isDashboard,
    });

    return {
      axis: {
        color: color("border-neutral"),
        ticks: {
          size: cartesian.label.fontSize,
          weight: 400,
          color: color("text-secondary"),
          family: fontFamily,
        },
        label: {
          size: cartesian.label.fontSize,
          weight: 400,
          color: color("text-secondary"),
          family: fontFamily,
        },
      },
      goal: {
        lineStroke: color("text-secondary"),
        label: {
          size: cartesian.goalLine.label.fontSize,
          weight: 400,
          color: color("text-secondary"),
          family: fontFamily,
        },
      },
      dataLabels: {
        weight: 400,
        color: color("text-secondary"),
        size: cartesian.label.fontSize,
        family: fontFamily,
      },
      grid: {
        color: color("border-neutral-subtle"),
      },
    };
  }, [theme, fontFamily, isDashboard]);
};
