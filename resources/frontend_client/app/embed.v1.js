// @ts-check

(function () {
  const error = (...messages) => console.error("[mb:embed:error]", ...messages);
  const warn = (...messages) => console.warn("[mb:embed:warning]", ...messages);

  const EMBEDDING_ROUTE = "embed/sdk/v1";

  const EMBED_SETTING_KEYS = [
    "theme",
    "dashboardId",
    "questionId",
    "notebookEditor",
    "apiKey",
    "instanceUrl",
  ];

  /**
   * @typedef {object} EmbedSettings
   * @property {string} instanceUrl
   * @property {string | HTMLElement} target
   * @property {string} apiKey
   * @property {string} [iframeClassName]
   * @property {string | number} [dashboardId]
   * @property {string | number} [questionId]
   * @property {boolean} [notebookEditor]
   * @property {object} [theme]
   */

  class MetabaseEmbed {
    static VERSION = "1.0.0";

    /** @param {EmbedSettings} settings */
    constructor(settings) {
      this._validateEmbedSettings(settings);

      this._embedSettings = settings;
      this._isEmbedReady = false;
      this._handleMessage = this._handleMessage.bind(this);
      this._setup();
    }

    /**
     * @param {EmbedSettings} settings
     * @public
     */
    updateSettings(settings) {
      if (!this._isEmbedReady) {
        warn("embed settings must be ready before updating the settings");
        return;
      }

      this._validateEmbedSettings(settings);

      const allowedSettings = Object.fromEntries(
        Object.entries(settings).filter(([key]) =>
          EMBED_SETTING_KEYS.includes(key),
        ),
      );

      this._sendMessage("metabase.embed.updateSettings", allowedSettings);
    }

    /**
     * @public
     */
    destroy() {
      if (this.iframe) {
        window.removeEventListener("message", this._handleMessage);
        this.iframe.remove();
        this._isEmbedReady = false;
      }
    }

    _setup() {
      const { instanceUrl, target, apiKey, iframeClassName } =
        this._embedSettings;

      this.iframe = document.createElement("iframe");
      this.iframe.src = `${instanceUrl}/${EMBEDDING_ROUTE}`;
      this.iframe.style.width = "100%";
      this.iframe.style.height = "100%";
      this.iframe.style.border = "none";

      if (!apiKey) {
        error("you must provide an API key");
        return;
      }

      if (iframeClassName) {
        this.iframe.classList.add(iframeClassName);
      }

      window.addEventListener("message", this._handleMessage);

      let parentContainer = null;

      if (typeof target === "string") {
        parentContainer = document.querySelector(target);
      } else if (target instanceof HTMLElement) {
        parentContainer = target;
      }

      if (!parentContainer) {
        error(`cannot find embed container "${target}"`);

        return;
      }

      parentContainer.appendChild(this.iframe);
    }

    /**
     * @param {EmbedSettings} settings
     */
    _validateEmbedSettings(settings) {
      if (
        settings.notebookEditor &&
        (settings.dashboardId || settings.questionId)
      ) {
        throw new Error(
          "[metabase.embed] notebookEditor cannot be used with dashboardId or questionId",
        );
      }

      if (settings.dashboardId && settings.questionId) {
        throw new Error(
          "[metabase.embed] cannot provide both dashboardId and questionId at the same time",
        );
      }
    }

    _handleMessage(event) {
      if (!event.data) {
        return;
      }

      if (event.data.type === "metabase.embed.iframeReady") {
        if (this._isEmbedReady) {
          return;
        }

        this._isEmbedReady = true;
        this.updateSettings(this._embedSettings);
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
