import { useMemo } from "react";

import { useSetting } from "metabase/common/hooks";

import { useSdkIframeEmbedSetupContext } from "../context";
import { getDerivedDefaultColorsForEmbedFlow } from "../utils/derived-colors-for-embed-flow";
import { getEmbedSnippet } from "../utils/embed-snippet";

export function useSdkIframeEmbedSnippet() {
  const instanceUrl = useSetting("site-url");
  const applicationColors = useSetting("application-colors");
  const { settings, experience } = useSdkIframeEmbedSetupContext();

  return useMemo(() => {
    // Apply derived colors to the settings for the code snippet
    const derivedTheme =
      settings.theme &&
      getDerivedDefaultColorsForEmbedFlow(
        settings.theme,
        applicationColors ?? undefined,
      );

    return getEmbedSnippet({
      settings: { ...settings, theme: derivedTheme },
      instanceUrl,
      experience,
    });
  }, [settings, applicationColors, instanceUrl, experience]);
}
