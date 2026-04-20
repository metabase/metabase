import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import type { EmbeddingTheme } from "metabase-types/api/embedding-theme";

import type { SdkIframeEmbedSetupTheme } from "../types";

/**
 * Resolves a wizard theme into an inline theme for the preview.
 *
 * If the theme references a saved theme via `id`, the saved theme's settings
 * are merged with any inline overrides on the wizard theme — inline values
 * (including per-color overrides) take precedence. The wizard-only `id` is
 * stripped so the result matches the shape embed.js expects.
 *
 * Returns the raw input (minus `id`) when there's no id match or when saved
 * themes haven't loaded yet.
 */
export function resolveSavedTheme({
  theme,
  savedThemes,
}: {
  theme: SdkIframeEmbedSetupTheme | undefined;
  savedThemes: EmbeddingTheme[] | undefined;
}): MetabaseTheme | undefined {
  if (!theme) {
    return undefined;
  }

  const { id, ...themeWithoutId } = theme;

  if (!id) {
    return themeWithoutId;
  }

  const saved = savedThemes?.find((t) => t.id === id);
  if (!saved) {
    return themeWithoutId;
  }

  return {
    ...saved.settings,
    ...themeWithoutId,
    colors: { ...saved.settings.colors, ...theme.colors },
  };
}
