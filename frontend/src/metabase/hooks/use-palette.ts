import { useMemo } from "react";

import type { ColorPalette } from "metabase/lib/colors/types";

import { useMantineTheme, type MantineColor } from "../ui";

/**
 * Gets a color palette from the current Mantine theme.
 *
 * Allows palettes to be overridden by the user, primarily via the React embedding SDK.
 */
export function usePalette(): ColorPalette {
  const theme = useMantineTheme();

  return useMemo(() => {
    const color = (name: MantineColor) => theme.colors[name]?.[0];

    return {
      white: color("white"),
      border: color("border"),
      "text-dark": color("text-dark"),
      "text-white": color("text-white"),
    };
  }, [theme.colors]);
}
