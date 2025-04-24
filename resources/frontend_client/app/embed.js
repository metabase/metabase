(function () {
  const error = (message) => console.error(`[mb:embed] ${message}`);

  class MetabaseEmbed {
    static VERSION = "0.0.1";

    constructor(options) {
      this.url = options.url;
      this.target = options.target;
      this.iframeClassName = options.iframeClassName;
      this.apiKey = options.apiKey;

      this.setup();
    }

    setup() {
      this.iframe = document.createElement("iframe");
      this.iframe.src = this.url;
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

      window.addEventListener("message", this._onMessage);

      let parentContainer = null;

      if (typeof this.target === "string") {
        parentContainer = document.querySelector(this.target);
      } else if (this.target instanceof HTMLElement) {
        parentContainer = this.target;
      }

      if (!parentContainer) {
        error(`cannot find embed container "${this.parentSelector}"`);

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
        const payload = {
          type: "metabase.embed.authenticate",
          payload: { apiKey: this.apiKey },
        };

        this.iframe.contentWindow.postMessage(payload, "*");
      }
    };
  }

  window["metabase.embed"] = { MetabaseEmbed };
})();
