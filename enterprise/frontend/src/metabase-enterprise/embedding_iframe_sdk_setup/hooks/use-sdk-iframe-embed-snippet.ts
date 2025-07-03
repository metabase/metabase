import { useMemo } from "react";

import { useSetting } from "metabase/common/hooks";
import type { SdkIframeEmbedTagSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import { useSdkIframeEmbedSetupContext } from "../context";
import type { SdkIframeEmbedSetupAuthType } from "../types";

export function useSdkIframeEmbedSnippet({
  authType,
}: {
  authType: SdkIframeEmbedSetupAuthType;
}) {
  const { settings } = useSdkIframeEmbedSetupContext();

  const instanceUrl = useSetting("site-url");

  return useMemo(() => {
    return getSnippet({
      target: "#metabase-embed",
      ...settings,
      instanceUrl,
      ...(authType === "user-session" ? { useExistingUserSession: true } : {}),
    });
  }, [settings, instanceUrl, authType]);
}

function getSnippet(settings: SdkIframeEmbedTagSettings): string {
  // filter out empty arrays, strings, objects, null and undefined.
  // this keeps the embed settings readable.
  const filteredSettings = Object.fromEntries(
    Object.entries(settings).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }

      if (typeof value === "object" && value !== null) {
        return Object.keys(value).length > 0;
      }

      return value !== undefined && value !== null && value !== "";
    }),
  );

  // format the json settings with proper indentation
  const formattedSettings = JSON.stringify(filteredSettings, null, 2)
    .replace(/^{/, "")
    .replace(/}$/, "")
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
    .trim();

  // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins.
  return `<script src="${settings.instanceUrl}/app/embed.js"></script>

<div id="metabase-embed"></div>

<script>
  const { MetabaseEmbed } = window["metabase.embed"];

  const embed = new MetabaseEmbed({
    ${formattedSettings}
  });
</script>`;
}
