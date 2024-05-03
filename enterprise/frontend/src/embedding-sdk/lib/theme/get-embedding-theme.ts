import type {
  MetabaseTheme,
  EmbeddingThemeOverride,
  MetabaseColor,
} from "embedding-sdk/types/theme";

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
    ...(theme.components && { other: theme.components }),
    ...(theme.fontSize && { fontSizes: { md: theme.fontSize } }),
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
