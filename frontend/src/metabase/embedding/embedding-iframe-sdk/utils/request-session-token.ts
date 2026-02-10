import { AUTH_TIMEOUT } from "embedding-sdk-bundle/errors";
import { samlTokenStorage } from "metabase/embedding-sdk/lib/saml-token-storage";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
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
      reject(AUTH_TIMEOUT());
    }, WAIT_FOR_SESSION_TOKEN_TIMEOUT);

    const handler = (event: MessageEvent<SdkIframeEmbedMessage>) => {
      if (!isWithinIframe() || !event.data) {
        return;
      }

      const action = event.data;

      if (action.type === "metabase.embed.submitSessionToken") {
        const { authMethod, sessionToken } = action.data;

        // Persist the session token to the iframe's local storage,
        // so we don't show the popup again.
        if (authMethod === "saml") {
          samlTokenStorage.set(sessionToken);
        }

        window.removeEventListener("message", handler);
        clearTimeout(timeout);
        resolve(sessionToken);
      }

      if (action.type === "metabase.embed.reportAuthenticationError") {
        const { error } = action.data;

        window.removeEventListener("message", handler);
        clearTimeout(timeout);
        reject(error);
      }
    };

    window.addEventListener("message", handler);

    const requestTokenMessage: SdkIframeEmbedTagMessage = {
      type: "metabase.embed.requestSessionToken",
    };

    window.parent.postMessage(requestTokenMessage, "*");
  });
}
