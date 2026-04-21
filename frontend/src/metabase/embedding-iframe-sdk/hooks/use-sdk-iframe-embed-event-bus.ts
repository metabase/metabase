import { useEffect, useState } from "react";
import { match } from "ts-pattern";

import { setGuestTokenFetchError } from "embedding-sdk-bundle/store/guest-embed";
import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedSettings,
  SdkIframeEmbedTagMessage,
} from "metabase/embedding/iframe-sdk/types/embed";
import type { SdkStore } from "metabase/embedding/sdk-bundle/store-types";
import { isWithinIframe } from "metabase/utils/iframe";
import type { EmbeddedAnalyticsJsEventSchema } from "metabase-types/analytics/embedded-analytics-js";

import { trackEmbeddedAnalyticsJs } from "./analytics";

type Handler = (event: MessageEvent<SdkIframeEmbedMessage>) => void;

type UsageAnalytics = {
  usage: EmbeddedAnalyticsJsEventSchema;
  embedHostUrl: string;
};

const sendMessage = (message: SdkIframeEmbedTagMessage) => {
  window.parent.postMessage(message, "*");
};

export function useSdkIframeEmbedEventBus({
  onSettingsChanged,
  store,
}: {
  onSettingsChanged?: (settings: SdkIframeEmbedSettings) => void;
  store: SdkStore;
}) {
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
        })

        /**
         * This handler is needed for the guest embed initial token flow. It also handles
         * the refresh flow, but `request-session-token.ts` handles that too — that file
         * covers both the SSO and the JWT refresh token flows.
         */
        .with(
          { type: "metabase.embed.reportAuthenticationError" },
          ({ data }) => {
            store.dispatch(
              setGuestTokenFetchError({ message: data.error?.message }),
            );
          },
        );
    };

    window.addEventListener("message", messageHandler);

    // notify embed.js that the iframe is ready
    sendMessage({ type: "metabase.embed.iframeReady" });

    return () => {
      window.removeEventListener("message", messageHandler);
    };
  }, [onSettingsChanged, store]);

  useEffect(() => {
    if (embedSettings?.instanceUrl && usageAnalytics) {
      const isEmbeddedAnalyticsJsPreview = isMetabaseInstance(
        embedSettings.instanceUrl,
        usageAnalytics.embedHostUrl,
      );
      if (!isEmbeddedAnalyticsJsPreview) {
        trackEmbeddedAnalyticsJs(usageAnalytics.usage);
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
