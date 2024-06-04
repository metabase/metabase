import { useMemo } from "react";

import { color } from "metabase/lib/colors";
import { useMantineTheme } from "metabase/ui";
import type { RowChartTheme } from "metabase/visualizations/shared/components/RowChart/types";
import { getVisualizationTheme } from "metabase/visualizations/shared/utils/theme";

interface RowChartThemeOptions {
  fontFamily?: string;
}

export const useRowChartTheme = (
  options: RowChartThemeOptions,
): RowChartTheme => {
  const theme = useMantineTheme();

  return useMemo(() => {
    const { fontFamily = "Lato" } = options;
    const { cartesian } = getVisualizationTheme(theme.other);

    return {
      axis: {
        color: color("border"),
        ticks: {
          size: cartesian.label.fontSize,
          weight: 700,
          color: color("text-medium"),
          family: fontFamily,
        },
        label: {
          size: cartesian.label.fontSize,
          weight: 700,
          color: color("text-dark"),
          family: fontFamily,
        },
      },
      goal: {
        lineStroke: color("text-medium"),
        label: {
          size: cartesian.goalLine.label.fontSize,
          weight: 700,
          color: color("text-medium"),
          family: fontFamily,
        },
      },
      dataLabels: {
        weight: 700,
        color: color("text-dark"),
        size: cartesian.label.fontSize,
        family: fontFamily,
      },
      grid: {
        color: color("border"),
      },
    };
  }, [options, theme]);
};
