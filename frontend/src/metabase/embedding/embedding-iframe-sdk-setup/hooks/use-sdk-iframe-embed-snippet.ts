import { useMemo } from "react";

import { useListEmbeddingThemesQuery } from "metabase/api/embedding-theme";
import { useSetting } from "metabase/common/hooks";

import { useSdkIframeEmbedSetupContext } from "../context";
import { getDerivedDefaultColorsForEmbedFlow } from "../utils/derived-colors-for-embed-flow";
import { getEmbedSnippet } from "../utils/embed-snippet";
import { resolveSavedTheme } from "../utils/resolve-saved-theme";

export function useSdkIframeEmbedSnippet() {
  const instanceUrl = useSetting("site-url");
  const applicationColors = useSetting("application-colors");
  const {
    isSimpleEmbedFeatureAvailable,
    settings,
    experience,
    guestEmbedSignedTokenForSnippet,
  } = useSdkIframeEmbedSetupContext();
  const { data: savedThemes } = useListEmbeddingThemesQuery();

  return useMemo(() => {
    // Inline the saved theme's settings (and drop the wizard-only `id` field)
    // so the snippet is self-contained and matches what embed.js expects.
    const resolvedTheme = resolveSavedTheme({
      theme: settings.theme,
      savedThemes,
    });

    // Apply derived colors to the settings for the code snippet
    const derivedTheme =
      resolvedTheme &&
      getDerivedDefaultColorsForEmbedFlow({
        isSimpleEmbedFeatureAvailable,
        theme: resolvedTheme,
        applicationColors: applicationColors ?? undefined,
      });

    return getEmbedSnippet({
      settings: { ...settings, theme: derivedTheme },
      instanceUrl,
      experience,
      guestEmbedSignedTokenForSnippet,
    });
  }, [
    settings,
    savedThemes,
    applicationColors,
    instanceUrl,
    experience,
    isSimpleEmbedFeatureAvailable,
    guestEmbedSignedTokenForSnippet,
  ]);
}
