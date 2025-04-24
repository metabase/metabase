// @ts-check

(function () {
  const error = (message) => console.error(`[mb:embed] ${message}`);

  class MetabaseEmbed {
    static VERSION = "0.0.1";

    constructor(options) {
      /** @type {string} */
      this.url = options.url;

      /** @type {string | HTMLElement} */
      this.target = options.target;

      /** @type {string} */
      this.iframeClassName = options.iframeClassName;

      /** @type {string} */
      this.apiKey = options.apiKey;

      this.setup();
    }

    setup() {
      this.iframe = document.createElement("iframe");
      this.iframe.src = `${this.url}`;
      this.iframe.style.width = "100%";
      this.iframe.style.height = "100%";
      this.iframe.style.border = "none";

      if (!this.apiKey) {
        error("you must provide an API key");
        return;
      }

      if (this.iframeClassName) {
        this.iframe.classList.add(this.iframeClassName);
      }

      window.addEventListener("message", this._handleMessage);

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
        window.removeEventListener("message", this._handleMessage);
        this.iframe.remove();
      }
    }

    _handleMessage(event) {
      if (!event.data) {
        return;
      }

      // once the iframe is ready to be authenticated, we forward the API key
      if (event.data.type === "metabase.embed.askToAuthenticate") {
        this._sendMessage({
          type: "metabase.embed.authenticate",
          payload: { apiKey: this.apiKey },
        });
      }
    }

    _sendMessage(message) {
      if (this.iframe?.contentWindow) {
        this.iframe.contentWindow.postMessage(message, "*");
      }
    }
  }

  window["metabase.embed"] = { MetabaseEmbed };
})();
