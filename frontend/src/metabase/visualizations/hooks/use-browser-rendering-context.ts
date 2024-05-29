import { useMemo } from "react";

import { usePalette } from "metabase/hooks/use-palette";
import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { measureTextWidth } from "metabase/lib/measure-text";
import type { RenderingContext } from "metabase/visualizations/types";

export const useBrowserRenderingContext = (
  fontFamily: string,
): RenderingContext => {
  const palette = usePalette();

  return useMemo(
    () => ({
      getColor: name => color(name, palette),
      formatValue: (value, options) => String(formatValue(value, options)),
      measureText: measureTextWidth,
      fontFamily: `${fontFamily}, Arial, sans-serif`,
    }),
    [fontFamily, palette],
  );
};
