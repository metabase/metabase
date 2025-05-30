import type { MetabaseEmbeddingSessionToken } from "embedding-sdk/types/refresh-token";
import { isWithinIframe } from "metabase/lib/dom";

import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "../types/embed";

/**
 * Requests a refresh token from the embed.js script which lives in the parent window.
 */
export function requestSessionTokenFromEmbedJs(): Promise<MetabaseEmbeddingSessionToken> {
  return new Promise<MetabaseEmbeddingSessionToken>((resolve) => {
    let handler: ((event: MessageEvent<SdkIframeEmbedMessage>) => void) | null =
      null;

    handler = (event: MessageEvent<SdkIframeEmbedMessage>) => {
      if (!isWithinIframe() || !event.data) {
        return;
      }

      const action = event.data;

      if (action.type === "metabase.embed.submitSessionToken") {
        window.removeEventListener("message", handler!);
        resolve(action.data.sessionToken);
      }
    };

    window.addEventListener("message", handler!);

    const requestTokenMessage: SdkIframeEmbedTagMessage = {
      type: "metabase.embed.requestSessionToken",
    };

    window.parent.postMessage(requestTokenMessage, "*");
  });
}
