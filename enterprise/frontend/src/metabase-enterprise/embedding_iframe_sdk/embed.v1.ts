import type {
  SdkIframeEmbedSettings,
  SdkIframeEmbedTagMessage,
  SdkIframeEmbedTagSettings,
} from "./types/embed";

const EMBEDDING_ROUTE = "embed/sdk/v1";

type EmbedSettingKey = keyof SdkIframeEmbedSettings;

const EMBED_SETTING_KEYS = [
  "apiKey",
  "instanceUrl",
  "dashboardId",
  "questionId",
  "template",
  "theme",
  "locale",
] as const satisfies EmbedSettingKey[];

class MetabaseEmbed {
  static readonly VERSION = "1.0.0";

  private _settings: SdkIframeEmbedTagSettings;
  private _isEmbedReady: boolean = false;
  private iframe: HTMLIFrameElement | null = null;

  constructor(settings: SdkIframeEmbedTagSettings) {
    if (!settings.apiKey || !settings.instanceUrl) {
      raiseError("api key and instance url must be provided");
    }

    this._validateEmbedSettings(settings);
    this._settings = settings;

    this._handleMessage = this._handleMessage.bind(this);
    this._setup();
  }

  /**
   * Merge these settings with the current settings.
   */
  public updateSettings(settings: Partial<SdkIframeEmbedSettings>) {
    if (!this._isEmbedReady) {
      warn("embed settings must be ready before updating the settings");
      return;
    }

    this._validateEmbedSettings(settings);

    const allowedSettings = Object.fromEntries(
      Object.entries(settings).filter(([key]) =>
        EMBED_SETTING_KEYS.includes(key as EmbedSettingKey),
      ),
    );

    this._settings = { ...this._settings, ...allowedSettings };
    this._sendMessage("metabase.embed.updateSettings", this._settings);
  }

  public destroy() {
    if (this.iframe) {
      window.removeEventListener("message", this._handleMessage);
      this.iframe.remove();
      this._isEmbedReady = false;
      this.iframe = null;
    }
  }

  private _setup() {
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

  private _validateEmbedSettings(settings: Partial<SdkIframeEmbedSettings>) {
    if (
      settings.template === "exploration" &&
      (settings.dashboardId || settings.questionId)
    ) {
      raiseError(
        "the exploration template can't be used with dashboardId or questionId",
      );
    }

    if (settings.dashboardId && settings.questionId) {
      raiseError("can't use both dashboardId and questionId at the same time");
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
      this.updateSettings(this._settings);
    }
  };

  private _sendMessage(type: string, data: unknown) {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage({ type, data }, "*");
    }
  }
}

const raiseError = (message: string) => {
  throw new Error(`[metabase.embed] ${message}`);
};

const warn = (...messages: unknown[]) =>
  console.warn("[metabase.embed.warning]", ...messages);

export { MetabaseEmbed };
