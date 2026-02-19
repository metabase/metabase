import { useMemo } from "react";

import { ALL_COLOR_NAMES } from "metabase/lib/colors";
import type { ColorPalette } from "metabase/lib/colors/types";
import { useMantineTheme } from "metabase/ui";

/**
 * Allows palettes to be overridden by the user, primarily via the React embedding SDK.
 */
export function usePalette(): ColorPalette {
  const theme = useMantineTheme();

  return useMemo(() => {
    return Object.fromEntries(
      ALL_COLOR_NAMES.map((name) => [name, theme.fn.themeColor(name)]),
    );
  }, [theme]);
}
