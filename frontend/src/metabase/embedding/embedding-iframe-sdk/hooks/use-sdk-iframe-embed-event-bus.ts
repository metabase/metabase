import { useEffect, useState } from "react";
import { match } from "ts-pattern";

import { setGuestTokenFetchError } from "embedding-sdk-bundle/store/guest-embed";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { captureEmbedderOriginFromEvent } from "metabase/embedding-sdk/embedder-origin";
import { isWithinIframe } from "metabase/utils/iframe";
import type { EmbeddedAnalyticsJsEventSchema } from "metabase-types/analytics/embedded-analytics-js";

import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedSettings,
  SdkIframeEmbedTagMessage,
} from "../types/embed";

import { trackEmbeddedAnalyticsJs } from "./analytics";

type Handler = (event: MessageEvent<SdkIframeEmbedMessage>) => void;

type UsageAnalytics = {
  usage: EmbeddedAnalyticsJsEventSchema;
  embedHostUrl: string;
};

export const sendMessage = (message: SdkIframeEmbedTagMessage) => {
  window.parent.postMessage(message, "*");
};

/**
 * `_embedReferrer` is self-reported by the host page's JS (it ends up in the
 * X-Metabase-Embed-Referrer header), so cross-check it against the
 * browser-attested sender origin and drop it on mismatch.
 */
export function stripUntrustedEmbedReferrer<
  T extends { _embedReferrer?: string },
>(settings: T, event: MessageEvent): T {
  const referrer = settings._embedReferrer;
  if (!referrer) {
    return settings;
  }
  try {
    if (new URL(referrer).origin === event.origin) {
      return settings;
    }
  } catch {
    // malformed referrer: fall through and strip it
  }
  return { ...settings, _embedReferrer: undefined };
}

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
          captureEmbedderOriginFromEvent(event);
          const settings = stripUntrustedEmbedReferrer(data, event);
          setEmbedSettings(settings);
          onSettingsChanged?.(settings);
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
