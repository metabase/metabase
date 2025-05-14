import { useEffect, useState } from "react";
import { match } from "ts-pattern";

import { isWithinIframe } from "metabase/lib/dom";

import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedSettings,
} from "../types/embed";

type Handler = (event: MessageEvent<SdkIframeEmbedMessage>) => void;

export function useSdkIframeEmbedEventBus(): {
  embedSettings: SdkIframeEmbedSettings | null;
} {
  const [embedSettings, setEmbedSettings] =
    useState<SdkIframeEmbedSettings | null>(null);

  useEffect(() => {
    const messageHandler: Handler = (event) => {
      if (!isWithinIframe() || !event.data) {
        return;
      }

      match(event.data).with(
        { type: "metabase.embed.setSettings" },
        ({ data }) => setEmbedSettings(data),
      );
    };

    window.addEventListener("message", messageHandler);

    // notify embed.js that the iframe is ready
    window.parent.postMessage({ type: "metabase.embed.iframeReady" }, "*");

    return () => {
      window.removeEventListener("message", messageHandler);
    };
  }, []);

  return { embedSettings };
}
