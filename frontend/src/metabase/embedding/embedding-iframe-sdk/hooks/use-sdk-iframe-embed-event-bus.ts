import { useEffect, useState } from "react";
import { match } from "ts-pattern";

import { trackSchemaEvent } from "metabase/lib/analytics";
import type { EmbeddedAnalyticsJsEventSchema } from "metabase-types/analytics/embedded-analytics-js";

import type {
  SdkIframeEmbedSettings,
  SdkIframeEmbedTagMessage,
} from "../types/embed";
import { listenForEajsMessages } from "../utils/post-message";

type UsageAnalytics = {
  usage: EmbeddedAnalyticsJsEventSchema;
  embedHostUrl: string;
};

const sendMessage = (message: SdkIframeEmbedTagMessage) => {
  window.parent.postMessage(message, "*");
};

export function useSdkIframeEmbedEventBus({
  onSettingsChanged,
}: {
  onSettingsChanged?: (settings: SdkIframeEmbedSettings) => void;
}) {
  const [embedSettings, setEmbedSettings] =
    useState<SdkIframeEmbedSettings | null>(null);
  const [usageAnalytics, setUsageAnalytics] = useState<UsageAnalytics | null>(
    null,
  );

  useEffect(() => {
    const removeMessageListener = listenForEajsMessages({
      messageSource: "embed.js",
      handler: (message) =>
        match(message)
          .with({ type: "metabase.embed.setSettings" }, ({ data }) => {
            setEmbedSettings(data);
            onSettingsChanged?.(data);
          })
          .with({ type: "metabase.embed.reportAnalytics" }, ({ data }) => {
            setUsageAnalytics({
              usage: data.usageAnalytics,
              embedHostUrl: data.embedHostUrl,
            });
          }),
    });

    // notify embed.js that the iframe is ready
    sendMessage({ type: "metabase.embed.iframeReady" });

    return removeMessageListener;
  }, [onSettingsChanged]);

  useEffect(() => {
    if (embedSettings?.instanceUrl && usageAnalytics) {
      const isEmbeddedAnalyticsJsPreview = isMetabaseInstance(
        embedSettings.instanceUrl,
        usageAnalytics.embedHostUrl,
      );
      if (!isEmbeddedAnalyticsJsPreview) {
        trackSchemaEvent("embedded_analytics_js", usageAnalytics.usage);
      }
    }
  }, [embedSettings?.instanceUrl, usageAnalytics]);

  return { sendMessage, embedSettings };
}

export function isMetabaseInstance(instanceUrl: string, embedHostUrl: string) {
  const instanceUrlObject = new URL(instanceUrl);
  const embedHostObject = new URL(embedHostUrl);

  const normalizedInstanceUrl =
    instanceUrlObject.host + instanceUrlObject.pathname;
  const normalizedEmbedHostUrl =
    embedHostObject.host + embedHostObject.pathname;

  /**
   * This is to ensure Metabase at Subpath works. e.g. https://example.com/metabase and https://example.com/embed
   * should be considered as a separate host. But https://example.com/metabase and https://example.com/metabase/dashboard/1
   * are the same host.
   */
  return normalizedEmbedHostUrl.startsWith(normalizedInstanceUrl);
}
