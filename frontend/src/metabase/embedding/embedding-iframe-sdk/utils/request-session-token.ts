import { AUTH_TIMEOUT } from "embedding-sdk-bundle/errors";
import { samlTokenStorage } from "metabase/embedding-sdk/lib/saml-token-storage";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

import { WAIT_FOR_SESSION_TOKEN_TIMEOUT } from "../constants";
import type { SdkIframeEmbedTagMessage } from "../types/embed";

import { listenForEajsMessages } from "./post-message";

/**
 * Requests a refresh token from the embed.js script which lives in the parent window.
 */
export function requestSessionTokenFromEmbedJs(): Promise<MetabaseEmbeddingSessionToken> {
  return new Promise<MetabaseEmbeddingSessionToken>((resolve, reject) => {
    let removeMessageListener = () => {};
    const timeout = setTimeout(() => {
      removeMessageListener();
      reject(AUTH_TIMEOUT());
    }, WAIT_FOR_SESSION_TOKEN_TIMEOUT);

    removeMessageListener = listenForEajsMessages({
      messageSource: "embed.js",
      handler: (message) => {
        if (message.type === "metabase.embed.submitSessionToken") {
          const { authMethod, sessionToken } = message.data;

          // Persist the session token to the iframe's local storage,
          // so we don't show the popup again.
          if (authMethod === "saml") {
            samlTokenStorage.set(sessionToken);
          }

          removeMessageListener();
          clearTimeout(timeout);
          resolve(sessionToken);
        }

        if (message.type === "metabase.embed.reportAuthenticationError") {
          const { error } = message.data;

          removeMessageListener();
          clearTimeout(timeout);
          reject(error);
        }
      },
    });

    const requestTokenMessage: SdkIframeEmbedTagMessage = {
      type: "metabase.embed.requestSessionToken",
    };

    window.parent.postMessage(requestTokenMessage, "*");
  });
}
