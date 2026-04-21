import { AUTH_TIMEOUT } from "metabase/embed/sdk-bundle/errors";
import { samlTokenStorage } from "metabase/embedding-sdk/lib/saml-token-storage";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import { isWithinIframe } from "metabase/utils/iframe";

import { WAIT_FOR_SESSION_TOKEN_TIMEOUT } from "../constants";
import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "../types/embed";

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
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(AUTH_TIMEOUT());
      }, WAIT_FOR_SESSION_TOKEN_TIMEOUT);

      const handler = (event: MessageEvent<SdkIframeEmbedMessage>) => {
        if (!isWithinIframe() || !event.data) {
          return;
        }

        const action = event.data;

        // Handle SSO session token response
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

        // Handle guest token refresh response
        if (action.type === "metabase.embed.submitRefreshedGuestToken") {
          const { guestToken } = action.data;

          window.removeEventListener("message", handler);
          clearTimeout(timeout);
          resolve(guestToken);
        }

        // Handle errors from both flows
        if (action.type === "metabase.embed.reportAuthenticationError") {
          const { error } = action.data;

          window.removeEventListener("message", handler);
          clearTimeout(timeout);
          reject(error);
        }
      };

      window.addEventListener("message", handler);

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
