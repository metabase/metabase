import * as MetabaseError from "embedding-sdk-bundle/errors";
// eslint-disable-next-line no-restricted-imports -- import type
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

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
export const openSamlLoginPopup = async (
  idpUrl: string,
): Promise<MetabaseEmbeddingSessionToken> => {
  return new Promise((resolve, reject) => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      idpUrl,
      "samlLoginPopup",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`,
    );

    if (!popup) {
      reject(MetabaseError.SAML_POPUP_BLOCKED());
      return;
    }

    const messageHandler = (
      event: MessageEvent<{
        type: string;
        authData: MetabaseEmbeddingSessionToken;
      }>,
    ) => {
      if (event.data && event.data.type === "SAML_AUTH_COMPLETE") {
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
        reject(MetabaseError.SAML_POPUP_CLOSED());
      }
    }, 1000);

    // Set timeout to prevent hanging indefinitely
    setTimeout(() => {
      clearInterval(checkClosed);
      window.removeEventListener("message", messageHandler);
      if (!popup.closed) {
        popup.close();
      }
      reject(MetabaseError.SAML_TIMEOUT());
    }, 60000); // 1 minute timeout
  });
};
