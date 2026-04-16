import type { EmbeddingTheme } from "metabase-types/api/embedding-theme";

import type { SdkIframeEmbedSetupTheme } from "../types";

/**
 * Resolves a wizard theme into an inline theme for the preview.
 *
 * If the theme references a saved theme via `id`, the saved theme's settings
 * are merged with any inline overrides on the wizard theme — inline values
 * (including per-color overrides) take precedence.
 *
 * Returns the raw input when there's no id, when saved themes haven't loaded,
 * or when the id doesn't match any saved theme.
 */
export function resolveSavedTheme({
  theme,
  savedThemes,
}: {
  theme: SdkIframeEmbedSetupTheme | undefined;
  savedThemes: EmbeddingTheme[] | undefined;
}): SdkIframeEmbedSetupTheme | undefined {
  const themeId = theme?.id;
  if (!themeId) {
    return theme;
  }

  const saved = savedThemes?.find((t) => t.id === themeId);
  if (!saved) {
    return theme;
  }

  return {
    ...saved.settings,
    ...theme,
    colors: { ...saved.settings.colors, ...theme.colors },
  };
}
