import { useCallback, useEffect, useState } from "react";
import { match } from "ts-pattern";

import { trackSchemaEvent } from "metabase/lib/analytics";
import { isWithinIframe } from "metabase/lib/dom";
import { uuid } from "metabase/lib/uuid";
import type { EmbeddedAnalyticsJsEventSchema } from "metabase-types/analytics/embedded-analytics-js";

import type {
  SdkIframeEmbedFunctionResultMessage,
  SdkIframeEmbedMessage,
  SdkIframeEmbedSettings,
  SdkIframeEmbedTagFunctionCallMessage,
  SdkIframeEmbedTagMessage,
  SdkIframeEventBusCalledFunctionName,
} from "../types/embed";

type Handler = (event: MessageEvent<SdkIframeEmbedMessage>) => void;

type UsageAnalytics = {
  usage: EmbeddedAnalyticsJsEventSchema;
  embedHostUrl: string;
};

// The parent frame logic may be async, so we give it up to 15 seconds to respond to cover possible slow network connection
const WAIT_FOR_FUNCTION_RESULT_MESSAGE_MAX_WAIT_TIME = 15000;

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

  const sendMessage = useCallback((message: SdkIframeEmbedTagMessage) => {
    window.parent.postMessage(message, "*");
  }, []);

  const waitForIncomingMessage = useCallback(
    async <
      TResult extends SdkIframeEmbedFunctionResultMessage["data"]["result"],
    >(
      functionName: SdkIframeEventBusCalledFunctionName,
      messageId: string,
    ): Promise<TResult> => {
      return new Promise<TResult>((resolve, reject) => {
        let waitTimeout = 0;

        waitTimeout = window.setTimeout(() => {
          window.removeEventListener("message", messageHandler);
          reject(new Error("Timeout waiting for incoming message"));
        }, WAIT_FOR_FUNCTION_RESULT_MESSAGE_MAX_WAIT_TIME);

        const messageHandler = (event: MessageEvent<SdkIframeEmbedMessage>) => {
          const message = event.data as SdkIframeEmbedFunctionResultMessage;
          const isExpectedMessage =
            message.type === `metabase.embed.functionResult.${functionName}` &&
            message.data?.messageId === messageId;

          if (isExpectedMessage) {
            window.clearTimeout(waitTimeout);
            window.removeEventListener("message", messageHandler);
            resolve(message.data.result as TResult);
          }
        };

        window.addEventListener("message", messageHandler);
      });
    },
    [],
  );

  const transferFunctionCallMessages = useCallback(
    async <
      TFunctionCallMessage extends SdkIframeEmbedTagFunctionCallMessage,
      TFunctionResultMessage extends SdkIframeEmbedFunctionResultMessage,
    >(
      functionName: SdkIframeEventBusCalledFunctionName,
      params: TFunctionCallMessage["data"]["params"],
    ): Promise<TFunctionResultMessage["data"]["result"]> => {
      const messageId = uuid();

      sendMessage({
        type: `metabase.embed.functionCall.${functionName}`,
        data: {
          messageId,
          params,
        },
      });

      return waitForIncomingMessage(functionName, messageId);
    },
    [sendMessage, waitForIncomingMessage],
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
    if (embedSettings?.instanceUrl && usageAnalytics?.embedHostUrl) {
      const isEmbeddedAnalyticsJsPreview = isMetabaseInstance(
        embedSettings.instanceUrl,
        usageAnalytics.embedHostUrl,
      );
      if (!isEmbeddedAnalyticsJsPreview) {
        trackSchemaEvent("embedded_analytics_js", usageAnalytics.usage);
      }
    }
  }, [embedSettings?.instanceUrl, usageAnalytics]);

  return { sendMessage, transferFunctionCallMessages, embedSettings };
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
