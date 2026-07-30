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
  ? { iframe: HTMLIFrameElement }
  : { iframe?: never });

export function listenForEajsMessages<Source extends EajsMessageSource>(
  options: ListenForEajsMessagesOptions<Source>,
) {
  const messageHandler = (event: MessageEvent<EajsMessageBySource[Source]>) => {
    switch (options.messageSource) {
      case "embed.js":
        if (!isWithinIframe() || event.source !== window.parent) {
          return;
        }
        break;
      case "iframe-content": {
        const iframeWindow = options.iframe?.contentWindow;
        if (!iframeWindow || event.source !== iframeWindow) {
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
