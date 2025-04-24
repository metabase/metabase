// @ts-check

(function () {
  const error = (...messages) => console.error(`[mb:embed]`, ...messages);

  // eslint-disable-next-line no-console
  const debug = (...messages) => console.debug(`[mb:embed:debug]`, ...messages);

  class MetabaseEmbed {
    static EMBED_JS_VERSION = "0.0.1";

    constructor(options) {
      /** @type {string} */
      this.url = options.url;

      /** @type {string | HTMLElement} */
      this.target = options.target;

      /** @type {string} */
      this.iframeClassName = options.iframeClassName;

      /** @type {string | undefined} */
      this.apiKey = options.apiKey;

      /** @type {string | null} */
      this.sdkVersion = null;

      this.setup();
    }

    setup() {
      this.iframe = document.createElement("iframe");
      this.iframe.src = this.url;
      this.iframe.style.width = "100%";
      this.iframe.style.height = "100%";
      this.iframe.style.border = "none";

      if (this.iframeClassName) {
        this.iframe.classList.add(this.iframeClassName);
      }

      window.addEventListener("message", this._onMessage);

      let parentContainer = null;

      if (typeof this.target === "string") {
        parentContainer = document.querySelector(this.target);
      } else if (this.target instanceof HTMLElement) {
        parentContainer = this.target;
      }

      if (!parentContainer) {
        error(`cannot find embed container "${this.target}"`);

        return;
      }

      parentContainer.appendChild(this.iframe);
    }

    destroy() {
      if (this.iframe) {
        window.removeEventListener("message", this._onMessage);
        this.iframe.remove();
      }
    }

    _onMessage = (event) => {
      if (!event.data) {
        return;
      }

      if (event.data.type === "metabase.embed.askToAuthenticate") {
        if (typeof event.data.payload.sdkVersion === "string") {
          this.sdkVersion = event.data.payload.sdkVersion;
        }

        this._authenticate();
      }
    };

    _isLocalhost() {
      const { hostname } = window.location;

      return hostname === "localhost" || hostname === "127.0.0.1";
    }

    async _authenticate() {
      if (this.apiKey) {
        this._authenticateWithApiKey();
        return;
      }

      const refreshToken = await this._getRefreshToken();

      if (!refreshToken) {
        error("failed to refresh the session token.");
        return;
      }

      this._sendMessage({
        type: "metabase.embed.authenticate",
        payload: { type: "sso", refreshToken },
      });
    }

    _sendMessage(message) {
      debug("sending message", message);

      if (this.iframe?.contentWindow) {
        // TODO: do not use origin of "*" in production
        this.iframe.contentWindow.postMessage(message, "*");
      }
    }

    _authenticateWithApiKey() {
      if (!this._isLocalhost()) {
        console.error("API keys can only be used in localhost.");
        return;
      }

      console.warn("API keys must be used for development only.");

      this._sendMessage({
        type: "metabase.embed.authenticate",
        payload: { type: "apiKey", apiKey: this.apiKey },
      });
    }

    /**
     * @returns {Promise<{id: string, exp: number} | null>}
     */
    _getRefreshToken = async () => {
      const url = new URL(this.url);
      const instanceUrl = url.origin;

      // GET /auth/sso with headers
      const urlResponse = await fetch(
        `${instanceUrl}/auth/sso`,
        this._getAuthFetchParams(),
      );

      const urlResponseJson = await urlResponse.json();

      // For the SDK, both SAML and JWT endpoints return {url: [...], method: "saml" | "jwt"}
      // when the headers are passed
      const { method, url: responseUrl } = urlResponseJson;

      if (method === "saml") {
        // The URL should point to the SAML IDP
        return this._getRefreshTokenViaPopup(responseUrl);
      }

      // Points to the JWT Auth endpoint on the client server
      return this._getRefreshTokenViaJwt(responseUrl);
    };

    /**
     * @param {string} url
     * @returns {Promise<{id: string, exp: number} | null>}
     */
    async _getRefreshTokenViaJwt(url) {
      const clientBackendResponse = await fetch(url, {
        method: "GET",
        credentials: "include",
      });

      // This should return {url: /auth/sso?jwt=[...]} with the signed token from the client backend
      const clientBackendResponseJson = await clientBackendResponse.json();

      // POST to /auth/sso?jwt=[...]
      const authUrlWithJwtToken = clientBackendResponseJson.url;

      const authSsoReponse = await fetch(
        authUrlWithJwtToken,
        this._getAuthFetchParams(),
      );

      if (!authSsoReponse.ok) {
        throw new Error(
          `Failed to fetch the session, HTTP status: ${authSsoReponse.status}`,
        );
      }
      const asText = await authSsoReponse.text();

      try {
        return JSON.parse(asText);
      } catch (ex) {
        return null;
      }
    }

    _getAuthFetchParams() {
      const fetchParams = {
        method: "GET",
        headers: {
          // eslint-disable-next-line no-literal-metabase-strings -- header name
          "X-Metabase-Client": "embedding-sdk-react",

          ...(this.sdkVersion && {
            // eslint-disable-next-line no-literal-metabase-strings -- header name
            "X-Metabase-Client-Version": this.sdkVersion,
          }),
        },
      };

      return fetchParams;
    }

    /**
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
     *
     * @returns {Promise<{id: string, exp: number} | null>}
     **/
    async _getRefreshTokenViaPopup(url) {
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
          reject(
            new Error("Popup blocked. Please allow popups for this site."),
          );
          return;
        }

        const messageHandler = (event) => {
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
    }
  }

  window["metabase.embed"] = { MetabaseEmbed };
})();
