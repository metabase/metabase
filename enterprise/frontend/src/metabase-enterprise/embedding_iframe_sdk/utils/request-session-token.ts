import type { MetabaseEmbeddingSessionToken } from "embedding-sdk/types/refresh-token";
import { isWithinIframe } from "metabase/lib/dom";

import { WAIT_FOR_SESSION_TOKEN_TIMEOUT } from "../constants";
import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "../types/embed";

/**
 * Requests a refresh token from the embed.js script which lives in the parent window.
 */
export function requestSessionTokenFromEmbedJs(): Promise<MetabaseEmbeddingSessionToken> {
  return new Promise<MetabaseEmbeddingSessionToken>((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Timed out waiting for session token"));
    }, WAIT_FOR_SESSION_TOKEN_TIMEOUT);

    const handler = (event: MessageEvent<SdkIframeEmbedMessage>) => {
      if (!isWithinIframe() || !event.data) {
        return;
      }

      const action = event.data;

      if (action.type === "metabase.embed.submitSessionToken") {
        window.removeEventListener("message", handler);
        clearTimeout(timeout);
        resolve(action.data.sessionToken);
      }
    };

    window.addEventListener("message", handler);

    const requestTokenMessage: SdkIframeEmbedTagMessage = {
      type: "metabase.embed.requestSessionToken",
    };

    window.parent.postMessage(requestTokenMessage, "*");
  });
}
