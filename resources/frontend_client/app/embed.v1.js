// @ts-check

(function () {
  const error = (...messages) => console.error("[mb:embed:error]", ...messages);
  const debug = (...messages) => console.debug("[mb:embed:debug]", ...messages);

  const EMBEDDING_ROUTE = "embed/v2/interactive";

  /** @typedef {{embedResourceType: string, embedResourceId: string, theme: object}} EmbedSettings */

  class MetabaseEmbed {
    static VERSION = "0.0.1";

    /**
     * @param {object} options
     * @param {string} options.instanceUrl
     * @param {string | HTMLElement} options.target
     * @param {string} options.apiKey
     * @param {string | undefined} options.iframeClassName
     * @param {string | number | undefined} options.dashboardId
     * @param {string | number | undefined} options.questionId
     * @param {boolean | undefined} options.notebookEditor
     */
    constructor(options) {
      /** @type {string} */
      this.instanceUrl = options.instanceUrl;

      /** @type {string | HTMLElement} */
      this.target = options.target;

      /** @type {string | undefined} */
      this.iframeClassName = options.iframeClassName;

      /** @type {string} */
      this.apiKey = options.apiKey;

      /** @type {EmbedSettings} */
      this.embedSettings = this._getEmbedSettings(options);

      this.isEmbedReady = false;

      // Bind the event handler to preserve 'this' context
      this._handleMessage = this._handleMessage.bind(this);

      this._setup();
    }

    /**
     * @param {EmbedSettings} settings
     */
    updateSettings(settings) {
      if (!this.isEmbedReady) {
        error("wait until the embed is ready before updating the settings");
        return;
      }

      this._sendMessage("metabase.embed.updateSettings", settings);
    }

    destroy() {
      if (this.iframe) {
        window.removeEventListener("message", this._handleMessage);
        this.iframe.remove();
        this.isEmbedReady = false;
      }
    }

    _setup() {
      this.iframe = document.createElement("iframe");
      this.iframe.src = `${this.instanceUrl}/${EMBEDDING_ROUTE}`;
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

    /** @returns {EmbedSettings} */
    _getEmbedSettings(options) {
      const settings = { theme: options.theme };

      if (options.notebookEditor) {
        if (options.dashboardId || options.questionId) {
          throw new Error(
            "[metabase.embed] notebookEditor cannot be used with dashboardId or questionId",
          );
        }

        return {
          ...settings,
          embedResourceType: "question",
          embedResourceId: "new",
        };
      }

      if (options.dashboardId && options.questionId) {
        throw new Error(
          "[metabase.embed] cannot provide both dashboardId and questionId at the same time",
        );
      }

      if (options.dashboardId !== undefined) {
        return {
          ...settings,
          embedResourceType: "dashboard",
          embedResourceId: options.dashboardId,
        };
      }

      if (options.questionId !== undefined) {
        return {
          ...settings,
          embedResourceType: "question",
          embedResourceId: options.questionId,
        };
      }

      throw new Error(
        "you must provide a dashboardId or questionId as an option",
      );
    }

    _handleMessage(event) {
      if (!event.data) {
        return;
      }

      if (event.data.type === "metabase.embed.iframeReady") {
        if (this.isEmbedReady) {
          return;
        }

        this.isEmbedReady = true;
        this.updateSettings(this.embedSettings);

        // TODO: implement SSO-based authentication once the new SSO implementation on the SDK is ready
        this._sendMessage("metabase.embed.authenticate", {
          apiKey: this.apiKey,
          metabaseInstanceUrl: this.instanceUrl,
        });
      }
    }

    _sendMessage(type, data) {
      if (this.iframe?.contentWindow) {
        this.iframe.contentWindow.postMessage({ type, data }, "*");
      }
    }
  }

  window["metabase.embed"] = { MetabaseEmbed };
})();
