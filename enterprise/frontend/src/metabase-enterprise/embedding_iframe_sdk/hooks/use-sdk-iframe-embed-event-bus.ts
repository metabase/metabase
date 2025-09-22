import { useEffect, useState } from "react";
import { match } from "ts-pattern";

import { isWithinIframe } from "metabase/lib/dom";
import type { EmbeddedAnalyticsJsEventSchema } from "metabase-types/analytics/embedded-analytics-js";

import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedSettings,
} from "../types/embed";

type Handler = (event: MessageEvent<SdkIframeEmbedMessage>) => void;

type UsageAnalytics = {
  usage: EmbeddedAnalyticsJsEventSchema;
  embedHostUrl: string;
};

export function useSdkIframeEmbedEventBus({
  onSettingsChanged,
}: {
  onSettingsChanged?: (settings: SdkIframeEmbedSettings) => void;
}): {
  embedSettings: SdkIframeEmbedSettings | null;
  usageAnalytics: UsageAnalytics | null;
} {
  const [embedSettings, setEmbedSettings] =
    useState<SdkIframeEmbedSettings | null>(null);
  const [usageAnalytics, setUsageAnalytics] = useState<UsageAnalytics | null>(
    null,
  );

  useEffect(() => {
    const messageHandler: Handler = (event) => {
      if (!isWithinIframe() || !event.data) {
        return;
      }

      match(event.data)
        .with({ type: "metabase.embed.setSettings" }, ({ data }) => {
          setEmbedSettings(data);
          onSettingsChanged?.(data);
        })
        .with({ type: "metabase.embed.reportAnalytics" }, ({ data }) => {
          setUsageAnalytics({
            usage: data.usageAnalytics,
            embedHostUrl: data.embedHostUrl,
          });
        });
    };

    window.addEventListener("message", messageHandler);

    // notify embed.js that the iframe is ready
    window.parent.postMessage({ type: "metabase.embed.iframeReady" }, "*");

    return () => {
      window.removeEventListener("message", messageHandler);
    };
  }, [onSettingsChanged]);

  return { embedSettings, usageAnalytics };
}
