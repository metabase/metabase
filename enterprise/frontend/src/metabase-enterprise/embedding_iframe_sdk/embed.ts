import type {
  SdkIframeEmbedSettings,
  SdkIframeEmbedTagMessage,
  SdkIframeEmbedTagSettings,
} from "./types/embed";

const EMBEDDING_ROUTE = "embed/sdk/v1";

type EmbedSettingKey = keyof SdkIframeEmbedSettings;

const ALLOWED_EMBED_SETTING_KEYS = [
  "apiKey",
  "instanceUrl",
  "dashboardId",
  "questionId",
  "template",
  "theme",
  "locale",
] as const satisfies EmbedSettingKey[];

type AllowedEmbedSettingKey = (typeof ALLOWED_EMBED_SETTING_KEYS)[number];

class MetabaseEmbed {
  static readonly VERSION = "1.0.0";

  private _settings: SdkIframeEmbedTagSettings;
  private _isEmbedReady: boolean = false;
  private iframe: HTMLIFrameElement | null = null;

  constructor(settings: SdkIframeEmbedTagSettings) {
    this._settings = settings;
    this._settings._isLocalhost = this._getIsLocalhost();

    this._setup();
  }

  /**
   * Merge these settings with the current settings.
   */
  public updateSettings(settings: Partial<SdkIframeEmbedSettings>) {
    // The value of instanceUrl must be the same as the initial value used to create an embed.
    // This allows users to pass a complete settings object that includes all their settings.
    if (
      settings.instanceUrl &&
      settings.instanceUrl !== this._settings.instanceUrl
    ) {
      raiseError("instanceUrl cannot be updated after the embed is created");
    }

    if (!this._isEmbedReady) {
      warn("embed settings must be ready before updating the settings");
      return;
    }

    this._setEmbedSettings(settings);
  }

  public destroy() {
    if (this.iframe) {
      window.removeEventListener("message", this._handleMessage);
      this.iframe.remove();
      this._isEmbedReady = false;
      this.iframe = null;
    }
  }

  private _setEmbedSettings(settings: Partial<SdkIframeEmbedSettings>) {
    const allowedSettings = Object.fromEntries(
      Object.entries(settings).filter(([key]) =>
        ALLOWED_EMBED_SETTING_KEYS.includes(key as AllowedEmbedSettingKey),
      ),
    );

    this._settings = { ...this._settings, ...allowedSettings };

    this._validateEmbedSettings(this._settings);
    this._sendMessage("metabase.embed.setSettings", this._settings);
  }

  private _setup() {
    this._validateEmbedSettings(this._settings);

    const { instanceUrl, target, iframeClassName } = this._settings;

    this.iframe = document.createElement("iframe");
    this.iframe.src = `${instanceUrl}/${EMBEDDING_ROUTE}`;
    this.iframe.style.width = "100%";
    this.iframe.style.height = "100%";
    this.iframe.style.border = "none";

    if (iframeClassName) {
      this.iframe.classList.add(iframeClassName);
    }

    window.addEventListener("message", this._handleMessage);

    let parentContainer: HTMLElement | null = null;

    if (typeof target === "string") {
      parentContainer = document.querySelector(target);
    } else if (target instanceof HTMLElement) {
      parentContainer = target;
    }

    if (!parentContainer) {
      raiseError(`cannot find embed container "${target}"`);
      return;
    }

    parentContainer.appendChild(this.iframe);
  }

  private _getIsLocalhost() {
    const { hostname } = window.location;

    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  private _validateEmbedSettings(settings: SdkIframeEmbedTagSettings) {
    if (!settings.apiKey || !settings.instanceUrl) {
      raiseError("API key and instance URL must be provided");
    }

    if (!settings.dashboardId && !settings.questionId && !settings.template) {
      raiseError(
        "either dashboardId, questionId, or template must be provided",
      );
    }

    if (
      settings.template === "exploration" &&
      (settings.dashboardId || settings.questionId)
    ) {
      raiseError(
        "the exploration template can't be used with dashboardId or questionId",
      );
    }

    if (
      (settings.template === "view-content" ||
        settings.template === "curate-content") &&
      !settings.initialCollection
    ) {
      raiseError(
        `initialCollection must be provided for the ${settings.template} template`,
      );
    }

    if (settings.dashboardId && settings.questionId) {
      raiseError(
        "can't use both dashboardId and questionId at the same time. to change the question to a dashboard, set the questionId to null (and vice-versa)",
      );
    }

    if (!settings.target) {
      raiseError("target must be provided");
    }
  }

  private _handleMessage = (event: MessageEvent<SdkIframeEmbedTagMessage>) => {
    if (!event.data) {
      return;
    }

    if (event.data.type === "metabase.embed.iframeReady") {
      if (this._isEmbedReady) {
        return;
      }

      this._isEmbedReady = true;
      this._setEmbedSettings(this._settings);
    }
  };

  private _sendMessage(type: string, data: unknown) {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage({ type, data }, "*");
    }
  }
}

class MetabaseEmbedError extends Error {
  constructor(message: string) {
    super(message);

    // eslint-disable-next-line no-literal-metabase-strings -- used in error messages
    this.name = "MetabaseEmbedError";
  }
}

const raiseError = (message: string) => {
  throw new MetabaseEmbedError(message);
};

const warn = (...messages: unknown[]) =>
  console.warn("[metabase.embed.warning]", ...messages);

export { MetabaseEmbed };
