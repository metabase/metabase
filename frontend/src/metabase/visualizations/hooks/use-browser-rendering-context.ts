import { useMemo } from "react";

import { usePalette } from "metabase/hooks/use-palette";
import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { measureTextWidth } from "metabase/lib/measure-text";
import { useMantineTheme } from "metabase/ui";
import { getVisualizationTheme } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

interface RenderingOptions {
  fontFamily: string;
}

export const useBrowserRenderingContext = (
  options: RenderingOptions,
): RenderingContext => {
  const { fontFamily } = options;

  const palette = usePalette();
  const theme = useMantineTheme();

  return useMemo(() => {
    const style = getVisualizationTheme(theme.other);

    return {
      getColor: name => color(name, palette),
      formatValue: (value, options) => String(formatValue(value, options)),
      measureText: measureTextWidth,
      fontFamily: `${fontFamily}, Arial, sans-serif`,
      theme: style,
    };
  }, [fontFamily, palette, theme]);
};
