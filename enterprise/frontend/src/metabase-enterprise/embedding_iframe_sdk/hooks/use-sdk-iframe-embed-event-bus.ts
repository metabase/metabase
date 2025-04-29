import { useEffect, useState } from "react";
import { match } from "ts-pattern";

import { isWithinIframe } from "metabase/lib/dom";

import type {
  SdkIframeEmbedPostMessageAction,
  SdkIframeEmbedSettings,
} from "../types/iframe";

type Handler = (event: MessageEvent<SdkIframeEmbedPostMessageAction>) => void;

export function useSdkIframeEmbedEventBus() {
  const [embedSettings, setEmbedSettings] =
    useState<SdkIframeEmbedSettings | null>(null);

  useEffect(() => {
    const messageHandler: Handler = (event) => {
      if (!isWithinIframe() || !event.data) {
        return;
      }

      match(event.data).with(
        { type: "metabase.embed.updateSettings" },
        ({ data: nextSettings }) => {
          setEmbedSettings((previousSettings) => ({
            ...previousSettings,
            ...nextSettings,
          }));
        },
      );
    };

    window.addEventListener("message", messageHandler);

    // notify embed.js that the iframe is ready
    window.parent.postMessage({ type: "metabase.embed.iframeReady" }, "*");

    return () => {
      window.removeEventListener("message", messageHandler);
    };
  });

  return { embedSettings };
}
