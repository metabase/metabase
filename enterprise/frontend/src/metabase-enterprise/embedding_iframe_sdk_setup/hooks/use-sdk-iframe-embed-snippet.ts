import { useMemo } from "react";
import _ from "underscore";

import { useSetting } from "metabase/common/hooks";

import { useSdkIframeEmbedSetupContext } from "../context";
import type { SdkIframeEmbedSetupSettings } from "../types";
import { filterEmptySettings } from "../utils/filter-empty-settings";

// Example target ID for the embed snippet.
const SNIPPET_EMBED_TARGET = "metabase-embed";

export function useSdkIframeEmbedSnippet() {
  const instanceUrl = useSetting("site-url");
  const { settings } = useSdkIframeEmbedSetupContext();

  return useMemo(
    () => getSnippet({ settings, instanceUrl }),
    [instanceUrl, settings],
  );
}

function getSnippet({
  settings,
  instanceUrl,
}: {
  settings: SdkIframeEmbedSetupSettings;
  instanceUrl: string;
}): string {
  const cleanedSettings = {
    // Only include useExistingUserSession if it is true.
    ..._.omit(settings, ["useExistingUserSession"]),
    ...(settings.useExistingUserSession
      ? { useExistingUserSession: true }
      : {}),

    // Append these settings that can't be controlled by users.
    instanceUrl,
    target: `#${SNIPPET_EMBED_TARGET}`,
  };

  // filter out empty arrays, strings, objects, null and undefined.
  // this keeps the embed settings readable.
  const filteredSettings = filterEmptySettings(cleanedSettings);

  // format the json settings with proper indentation
  const formattedSettings = JSON.stringify(filteredSettings, null, 2)
    .replace(/^{/, "")
    .replace(/}$/, "")
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
    .trim();

  // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins.
  return `<script src="${instanceUrl}/app/embed.js"></script>

<div id="${SNIPPET_EMBED_TARGET}"></div>

<script>
  const { MetabaseEmbed } = window["metabase.embed"];

  const embed = new MetabaseEmbed({
    ${formattedSettings}
  });
</script>`;
}
