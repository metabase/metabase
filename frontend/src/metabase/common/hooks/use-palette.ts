import { useMemo } from "react";

import type { ColorPalette } from "metabase/lib/colors/types";
import { useMantineTheme } from "metabase/ui";

/**
 * Extracts a color palette from a subset of colors in the Mantine theme.
 *
 * Allows palettes to be overridden by the user, primarily via the React embedding SDK.
 */
export function usePalette(): ColorPalette {
  const theme = useMantineTheme();

  return useMemo(() => {
    return {
      white: theme.fn.themeColor("white"),
      border: theme.fn.themeColor("border"),
      "text-primary": theme.fn.themeColor("text-primary"),
      "text-secondary": theme.fn.themeColor("text-secondary"),
      "text-disabled": theme.fn.themeColor("text-disabled"),
      "text-primary-inverse": theme.fn.themeColor("text-primary-inverse"),
      "background-primary": theme.fn.themeColor("background-primary"),
    };
  }, [theme]);
}
