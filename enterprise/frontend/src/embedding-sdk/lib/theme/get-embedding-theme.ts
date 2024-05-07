import type { MetabaseTheme, MetabaseColor } from "../../types/theme";
import type { EmbeddingThemeOverride } from "../../types/theme/private";

import { colorTuple } from "./color-tuple";

/**
 * Transforms a public-facing Metabase theme configuration
 * into a Mantine theme override for internal use.
 */
export function getEmbeddingThemeOverride(
  theme: MetabaseTheme,
): EmbeddingThemeOverride {
  const override: EmbeddingThemeOverride = {
    ...(theme.lineHeight && { lineHeight: theme.lineHeight }),
    ...(theme.fontFamily && { fontFamily: theme.fontFamily }),

    other: {
      ...theme.components,
      fontSize: theme.fontSize,
    },
  };

  if (theme.colors) {
    override.colors = {};

    // Apply color palette overrides
    for (const name in theme.colors) {
      const color = theme.colors[name as MetabaseColor];

      if (color) {
        override.colors[name] = colorTuple(color);
      }
    }
  }

  return override;
}
