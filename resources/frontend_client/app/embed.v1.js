// @ts-check

(function () {
  const error = (...messages) => console.error("[mb:embed:error]", ...messages);
  const warn = (...messages) => console.warn("[mb:embed:warning]", ...messages);

  const EMBEDDING_ROUTE = "embed/sdk/v1";

  /**
   * @typedef {object} EmbedOptions
   * @property {string} instanceUrl
   * @property {string | HTMLElement} target
   * @property {string} apiKey
   * @property {string} [iframeClassName]
   * @property {string | number} [dashboardId]
   * @property {string | number} [questionId]
   * @property {boolean} [notebookEditor]
   * @property {object} [theme]
   */

  /**
   * @typedef {object} InternalEmbedSettings
   * @property {string} embedResourceType
   * @property {number | string} embedResourceId
   * @property {object} [theme]
   */

  class MetabaseEmbed {
    static VERSION = "1.0.0";

    /** @param {EmbedOptions} options */
    constructor(options) {
      this._embedOptions = options;
      this._isEmbedReady = false;
      this._handleMessage = this._handleMessage.bind(this);
      this._setup();
    }

    /**
     * @param {EmbedOptions} settings
     * @public
     */
    updateSettings(settings) {
      if (!this._isEmbedReady) {
        warn("embed settings must be ready before updating the settings");
        return;
      }

      this._sendMessage(
        "metabase.embed.updateSettings",
        this._getInternalEmbedSettings(settings),
      );
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
        this._embedOptions;

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
     * @param {EmbedOptions} options
     * @returns {InternalEmbedSettings}
     **/
    _getInternalEmbedSettings(options) {
      const settings = {
        theme: options.theme,
        notebookEditor: options.notebookEditor,
      };

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
        if (this._isEmbedReady) {
          return;
        }

        this._isEmbedReady = true;
        this.updateSettings(this._embedOptions);

        const { instanceUrl, apiKey } = this._embedOptions;

        // TODO: implement SSO-based authentication once the new SSO implementation on the SDK is ready
        this._sendMessage("metabase.embed.authenticate", {
          apiKey,
          metabaseInstanceUrl: instanceUrl,
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
