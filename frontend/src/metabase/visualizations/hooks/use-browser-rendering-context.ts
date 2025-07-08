import { useMemo } from "react";

import { usePalette } from "metabase/common/hooks/use-palette";
import { getIsNightMode } from "metabase/dashboard/selectors";
import { color } from "metabase/lib/colors";
import { measureTextHeight, measureTextWidth } from "metabase/lib/measure-text";
import { useSelector } from "metabase/lib/redux";
import { useMantineTheme } from "metabase/ui";
import { getVisualizationTheme } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

interface RenderingOptions {
  fontFamily: string;
  isDashboard?: boolean;
  isFullscreen?: boolean;
}

export const useBrowserRenderingContext = (
  options: RenderingOptions,
): RenderingContext => {
  const { fontFamily, isDashboard, isFullscreen } = options;

  const palette = usePalette();
  const theme = useMantineTheme();
  const isNightMode = useSelector(getIsNightMode);

  return useMemo(() => {
    const style = getVisualizationTheme({
      theme: theme.other,
      isDashboard,
      isNightMode: isNightMode && isFullscreen,
    });

    return {
      getColor: (name) => color(name, palette),
      measureText: measureTextWidth,
      measureTextHeight,
      fontFamily: `${fontFamily}, Arial, sans-serif`,
      theme: style,
    };
  }, [fontFamily, palette, theme, isDashboard, isNightMode, isFullscreen]);
};
