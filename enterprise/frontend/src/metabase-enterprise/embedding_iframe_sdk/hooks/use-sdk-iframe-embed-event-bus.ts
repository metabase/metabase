import { useCallback, useEffect, useState } from "react";
import { match } from "ts-pattern";

import { trackSchemaEvent } from "metabase/lib/analytics";
import { isWithinIframe } from "metabase/lib/dom";
import type { EmbeddedAnalyticsJsEventSchema } from "metabase-types/analytics/embedded-analytics-js";

import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedSettings,
  SdkIframeEmbedTagMessage,
} from "../types/embed";

type Handler = (event: MessageEvent<SdkIframeEmbedMessage>) => void;

type UsageAnalytics = {
  usage: EmbeddedAnalyticsJsEventSchema;
  embedHostUrl: string;
};

const WAIT_FOR_INCOMING_MESSAGE_MAX_WAIT_TIME = 10000;

export function useSdkIframeEmbedEventBus({
  onSettingsChanged,
}: {
  onSettingsChanged?: (settings: SdkIframeEmbedSettings) => void;
}): {
  sendMessage: (message: SdkIframeEmbedTagMessage) => void;
  waitForIncomingMessage: <TData extends SdkIframeEmbedMessage["data"]>(
    handler: (event: SdkIframeEmbedMessage) => boolean,
  ) => Promise<TData>;
  embedSettings: SdkIframeEmbedSettings | null;
} {
  const [embedSettings, setEmbedSettings] =
    useState<SdkIframeEmbedSettings | null>(null);
  const [usageAnalytics, setUsageAnalytics] = useState<UsageAnalytics | null>(
    null,
  );

  const sendMessage = useCallback((message: SdkIframeEmbedTagMessage) => {
    window.parent.postMessage(message, "*");
  }, []);

  const waitForIncomingMessage = useCallback(
    async <TData extends SdkIframeEmbedMessage["data"]>(
      handler: (event: SdkIframeEmbedMessage) => boolean,
    ): Promise<TData> => {
      return new Promise<TData>((resolve, reject) => {
        let waitTimeout = 0;

        waitTimeout = window.setTimeout(() => {
          window.removeEventListener("message", messageHandler);
          reject(new Error("Timeout waiting for incoming message"));
        }, WAIT_FOR_INCOMING_MESSAGE_MAX_WAIT_TIME);

        const messageHandler = (event: MessageEvent<SdkIframeEmbedMessage>) => {
          const isExpectedMessage = handler(event.data);

          if (isExpectedMessage) {
            window.clearTimeout(waitTimeout);
            resolve(event.data.data as TData);
          }
        };

        window.addEventListener("message", messageHandler);
      });
    },
    [],
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
    sendMessage({ type: "metabase.embed.iframeReady" });

    return () => {
      window.removeEventListener("message", messageHandler);
    };
  }, [onSettingsChanged, sendMessage]);

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

  return { sendMessage, waitForIncomingMessage, embedSettings };
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
