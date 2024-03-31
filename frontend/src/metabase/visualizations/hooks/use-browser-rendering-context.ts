import { useMemo } from "react";

import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { measureTextWidth } from "metabase/lib/measure-text";
import type { RenderingContext } from "metabase/visualizations/types";

export const useBrowserRenderingContext = (
  fontFamily: string,
): RenderingContext =>
  useMemo(
    () => ({
      getColor: color,
      formatValue: (value, options) => String(formatValue(value, options)),
      measureText: measureTextWidth,
      fontFamily: fontFamily,
    }),
    [fontFamily],
  );
