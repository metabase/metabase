import { useMemo } from "react";

import { useMantineTheme } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import type { RowChartTheme } from "metabase/visualizations/shared/components/RowChart/types";
import { getVisualizationTheme } from "metabase/visualizations/shared/utils/theme";

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
        color: color("border"),
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
        color: color("border-subtle"),
      },
    };
  }, [theme, fontFamily, isDashboard]);
};
