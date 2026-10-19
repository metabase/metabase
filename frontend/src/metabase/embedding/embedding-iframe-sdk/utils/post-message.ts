import { isIframeMessage } from "embedding-sdk-shared/lib/data-app-embed";
import { isWithinIframe } from "metabase/utils/iframe";

import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "../types/embed";

type EajsMessageSource = "embed.js" | "iframe-content";

type EajsMessageBySource = {
  "embed.js": SdkIframeEmbedMessage;
  "iframe-content": SdkIframeEmbedTagMessage;
};

type ListenForEajsMessagesOptions<Source extends EajsMessageSource> = {
  /** Where the message is expected to come from. */
  messageSource: Source;
  handler: (message: EajsMessageBySource[Source]) => void;
} & (Source extends "iframe-content"
  ? { iframe: HTMLIFrameElement; expectedOrigin?: string }
  : { iframe?: never; expectedOrigin?: never });

export function listenForEajsMessages<Source extends EajsMessageSource>(
  options: ListenForEajsMessagesOptions<Source>,
) {
  const messageHandler = (event: MessageEvent<EajsMessageBySource[Source]>) => {
    switch (options.messageSource) {
      case "embed.js":
        if (
          !isWithinIframe() ||
          !event.isTrusted ||
          event.source !== window.parent
        ) {
          return;
        }
        break;
      case "iframe-content": {
        if (!isIframeMessage(event, options.iframe, options.expectedOrigin)) {
          return;
        }
        break;
      }
    }

    if (!event.data) {
      return;
    }

    options.handler(event.data);
  };

  window.addEventListener("message", messageHandler);

  return () => window.removeEventListener("message", messageHandler);
}
