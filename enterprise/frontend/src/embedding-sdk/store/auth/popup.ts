import type { MetabaseEmbeddingSessionToken } from "embedding-sdk/types/refresh-token";

import { authTokenStorage } from "./saml-token-storage";

/*
 * For the markup for the popup (nice rhyme), visit
 * enterprise/backend/src/metabase_enterprise/sso/integrations/saml.clj
 *
 * This setup works with SAML (and hopefully we can use it with silent iframe in the future).
 * What happens is:
 *  1) The user logs into their app which contains the MetabaseProvider / SDK components
 *  2) The SDK will run GET /auth/sso with SDK headers
 *  3) The server returns the SAML redirect URL, which we pass into this function
 *  4) We then take that URL and put it in the popup.
 *  5) The IDP eventually redirects back to POST /auth/sso which returns HTML markup
 *      that postMessages the token to this window. We'll save it in localStorage for now.
 * */
export const popupRefreshTokenFn = async (url: string) => {
  return new Promise((resolve, reject) => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      url,
      "samlLoginPopup",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`,
    );

    if (!popup) {
      reject(new Error("Popup blocked. Please allow popups for this site."));
      return;
    }

    const messageHandler = (
      event: MessageEvent<{
        type: "SAML_AUTH_COMPLETE";
        authData: MetabaseEmbeddingSessionToken;
      }>,
    ) => {
      if (event.data && event.data.type === "SAML_AUTH_COMPLETE") {
        authTokenStorage.set(event.data.authData);
        window.removeEventListener("message", messageHandler);
        if (!popup.closed) {
          popup.close();
        }
        resolve(event.data.authData);
      }
    };

    window.addEventListener("message", messageHandler);

    // Handle popup closing
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", messageHandler);
        reject(new Error("Authentication was canceled"));
      }
    }, 1000);

    // Set timeout to prevent hanging indefinitely
    setTimeout(() => {
      clearInterval(checkClosed);
      window.removeEventListener("message", messageHandler);
      if (!popup.closed) {
        popup.close();
      }
      reject(new Error("Authentication timed out"));
    }, 60000); // 1 minute timeout
  });
};
