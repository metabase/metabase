import { useMemo } from "react";

import type { SdkIframeEmbedTagSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import { useSdkIframeEmbedSetupContext } from "../components/SdkIframeEmbedSetupContext";
import { API_KEY_PLACEHOLDER } from "../constants";

export function useSdkIframeEmbedSnippet() {
  const { options } = useSdkIframeEmbedSetupContext();
  const { settings } = options;

  // Generate dynamic snippet based on context settings
  return useMemo(() => {
    return getSnippet({
      target: "#metabase-embed",
      ...settings,
      apiKey: settings.apiKey ?? API_KEY_PLACEHOLDER,
    });
  }, [settings]);
}

function getSnippet(settings: SdkIframeEmbedTagSettings): string {
  const nextSettings = { ...settings };

  const stringifiedSettings = JSON.stringify(nextSettings, null, 2)
    .replace(/^{/, "")
    .replace(/}$/, "")
    .split("\n")
    .map((line, index) => (index === 0 ? `  ${line}` : `  ${line}`))
    .join("\n")
    .trim();

  // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins.
  return `<script src="${settings.instanceUrl}/app/embed.js"></script>
<div id="metabase-embed"></div>

<script>
  const { MetabaseEmbed } = window["metabase.embed"];

  const embed = new MetabaseEmbed({
    ${stringifiedSettings}
  });
</script>`;
}
