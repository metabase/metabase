import { useMemo } from "react";

import { getIsNightMode } from "metabase/dashboard/selectors";
import { usePalette } from "metabase/hooks/use-palette";
import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { measureTextWidth, measureTextHeight } from "metabase/lib/measure-text";
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
      getColor: name => color(name, palette),
      formatValue: (value, options) => String(formatValue(value, options)),
      measureText: measureTextWidth,
      measureTextHeight,
      fontFamily: `${fontFamily}, Arial, sans-serif`,
      theme: style,
    };
  }, [fontFamily, palette, theme, isDashboard, isNightMode, isFullscreen]);
};
