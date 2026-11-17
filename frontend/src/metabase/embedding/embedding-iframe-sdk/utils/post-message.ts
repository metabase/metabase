import { listenForIframeMessages } from "embedding-sdk-shared/lib/listen-for-iframe-messages";
import { isWithinIframe } from "metabase/utils/iframe";

import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "../types/embed";

type ListenForEajsMessagesOptions = {
  expectedOrigin?: string;
} & (
  | {
      messageSource: "embed.js";
      handler: (message: SdkIframeEmbedMessage) => void;
    }
  | {
      messageSource: "iframe-content";
      iframe: HTMLIFrameElement;
      handler: (message: SdkIframeEmbedTagMessage) => void;
    }
);

export function listenForEajsMessages(options: ListenForEajsMessagesOptions) {
  if (options.messageSource === "iframe-content") {
    return listenForIframeMessages(options);
  }

  const messageHandler = (event: MessageEvent<SdkIframeEmbedMessage>) => {
    if (
      !isWithinIframe() ||
      !event.isTrusted ||
      event.source !== window.parent
    ) {
      return;
    }

    if (options.expectedOrigin && event.origin !== options.expectedOrigin) {
      return;
    }

    if (!event.data) {
      return;
    }

    options.handler(event.data);
  };

  window.addEventListener("message", messageHandler);

  return () => window.removeEventListener("message", messageHandler);
}
