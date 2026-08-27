import { AUTH_TIMEOUT } from "embedding-sdk-shared/errors";
import { samlTokenStorage } from "metabase/embedding-sdk/lib/saml-token-storage";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

import { WAIT_FOR_SESSION_TOKEN_TIMEOUT } from "../constants";
import type { SdkIframeEmbedTagMessage } from "../types/embed";

import { listenForEajsMessages } from "./post-message";

/**
 * Requests a refresh token from the embed.js script which lives in the parent window.
 * Supports both SSO authentication and guest token refresh.
 */
export function requestSessionTokenFromEmbedJs(): Promise<MetabaseEmbeddingSessionToken>;
export function requestSessionTokenFromEmbedJs(options: {
  expiredToken: string;
}): Promise<string>;
export function requestSessionTokenFromEmbedJs(options?: {
  expiredToken: string;
}): Promise<MetabaseEmbeddingSessionToken | string> {
  return new Promise<MetabaseEmbeddingSessionToken | string>(
    (resolve, reject) => {
      let removeMessageListener = () => {};
      const timeout = setTimeout(() => {
        removeMessageListener();
        reject(AUTH_TIMEOUT());
      }, WAIT_FOR_SESSION_TOKEN_TIMEOUT);

      removeMessageListener = listenForEajsMessages({
        messageSource: "embed.js",
        handler: (message) => {
          // Handle SSO session token response
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

          // Handle guest token refresh response
          if (message.type === "metabase.embed.submitRefreshedGuestToken") {
            const { guestToken } = message.data;

            removeMessageListener();
            clearTimeout(timeout);
            resolve(guestToken);
          }

          // Handle errors from both flows
          if (message.type === "metabase.embed.reportAuthenticationError") {
            const { error } = message.data;

            removeMessageListener();
            clearTimeout(timeout);
            reject(error);
          }
        },
      });

      // Send appropriate request message based on flow
      if (options?.expiredToken) {
        // is guest embed token refresh flow
        const guestEmbedSessionRefreshMessage: SdkIframeEmbedTagMessage = {
          type: "metabase.embed.requestGuestTokenRefresh",
          data: { expiredToken: options.expiredToken },
        };
        window.parent.postMessage(guestEmbedSessionRefreshMessage, "*");
      } else {
        // SSO flow
        const requestTokenMessage: SdkIframeEmbedTagMessage = {
          type: "metabase.embed.requestSessionToken",
        };
        window.parent.postMessage(requestTokenMessage, "*");
      }
    },
  );
}
