import { useMemo } from "react";

import { usePalette } from "metabase/common/hooks/use-palette";
import { useMantineTheme } from "metabase/ui";
import { color } from "metabase/ui/colors";
import { getFontFamilyValue } from "metabase/utils/fonts";
import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/utils/measure-text";
import {
  type RenderingContext,
  getVisualizationTheme,
  isLargeCartesianCard,
} from "metabase/viz-core";

interface RenderingOptions {
  fontFamily: string;
  isDashboard?: boolean;
  isCompact?: boolean;
  isFullscreen?: boolean;
  dashboardCardSize?: { width: number; height: number };
}

export const useBrowserRenderingContext = (
  options: RenderingOptions,
): RenderingContext => {
  const { fontFamily, isDashboard, isCompact, dashboardCardSize } = options;
  const isLargeCard =
    isDashboard || isCompact ? isLargeCartesianCard(dashboardCardSize) : false;

  const palette = usePalette();
  const theme = useMantineTheme();

  return useMemo(() => {
    const style = getVisualizationTheme({
      theme: theme.other,
      isDashboard,
      isCompact,
      isLargeCard,
    });

    return {
      getColor: (name) => color(name, palette),
      measureText: measureTextWidth,
      measureTextHeight,
      fontFamily: getFontFamilyValue(fontFamily),
      colorScheme: theme.other?.colorScheme ?? "light",
      theme: style,
    };
  }, [fontFamily, palette, theme, isDashboard, isCompact, isLargeCard]);
};
