import { isWithinIframe } from "metabase/lib/dom";

import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "../types/embed";

/**
 * Requests the parent window (embed.js) to handle a link click.
 * Returns { handled: true } if the parent handled the link, { handled: false } otherwise.
 */
export function bridgeHandleLinkForEmbedJs(
  url: string,
): Promise<{ handled: boolean }> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();

    const handler = (event: MessageEvent<SdkIframeEmbedMessage>) => {
      if (!isWithinIframe() || !event.data) {
        return;
      }

      const action = event.data;

      if (
        action.type === "metabase.embed.handleLinkResponse" &&
        action.data.requestId === requestId
      ) {
        window.removeEventListener("message", handler);
        resolve({ handled: action.data.handled });
      }
    };

    window.addEventListener("message", handler);

    const handleLinkMessage: SdkIframeEmbedTagMessage = {
      type: "metabase.embed.handleLink",
      data: { url, requestId },
    };

    window.parent.postMessage(handleLinkMessage, "*");
  });
}
