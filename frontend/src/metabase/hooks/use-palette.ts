import { useMemo } from "react";

import type { ColorPalette } from "metabase/lib/colors/types";

import { useMantineTheme } from "../ui";

/**
 * Gets a color palette from the current Mantine theme.
 *
 * Allows palettes to be overridden by the user, primarily via the React embedding SDK.
 */
export function usePalette(): ColorPalette {
  const theme = useMantineTheme();

  return useMemo(() => {
    return {
      white: theme.colors["white"]?.[0],
      border: theme.colors["border"]?.[0],
      "text-dark": theme.colors["text-dark"]?.[0],
      "text-white": theme.colors["text-white"]?.[0],
    };
  }, [theme.colors]);
}
