import { useEffect, useState } from "react";
import { match } from "ts-pattern";

import { isWithinIframe } from "metabase/lib/dom";

import type {
  IframeAuthConfig,
  SdkIframeEmbedPostMessageAction,
  SdkIframeEmbedSettings,
} from "../types/iframe";

type Handler = (event: MessageEvent<SdkIframeEmbedPostMessageAction>) => void;

export function useSdkIframeEmbedEventBus() {
  const [iframeAuthConfig, setAuthConfig] = useState<IframeAuthConfig | null>(
    null,
  );

  const [iframeSettings, setSettings] = useState<SdkIframeEmbedSettings | null>(
    null,
  );

  useEffect(() => {
    const messageHandler: Handler = (event) => {
      if (!isWithinIframe() || !event.data) {
        return;
      }

      match(event.data)
        .with({ type: "metabase.embed.authenticate" }, ({ data }) => {
          setAuthConfig(data);
        })
        .with({ type: "metabase.embed.updateSettings" }, ({ data }) => {
          setSettings(data);
        });
    };

    window.addEventListener("message", messageHandler);

    window.parent.postMessage(
      { type: "metabase.embed.askToAuthenticate" },
      "*",
    );

    return () => {
      window.removeEventListener("message", messageHandler);
    };
  });

  return { iframeAuthConfig, iframeSettings };
}
