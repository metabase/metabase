import { useMemo } from "react";

import type { ColorPalette } from "metabase/lib/colors/types";

import { useMantineTheme } from "../ui";

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
      "text-dark": theme.fn.themeColor("text-dark"),
      "text-white": theme.fn.themeColor("text-white"),
    };
  }, [theme.fn]);
}
