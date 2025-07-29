import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
  openSamlLoginPopup,
  validateSessionToken,
} from "embedding/auth-common";
import { INVALID_AUTH_METHOD, MetabaseError } from "embedding-sdk/errors";

import {
  ALLOWED_EMBED_SETTING_KEYS,
  type AllowedEmbedSettingKey,
  DISABLE_UPDATE_FOR_KEYS,
} from "./constants";
import type {
  SdkIframeEmbedEvent,
  SdkIframeEmbedEventHandler,
  SdkIframeEmbedMessage,
  SdkIframeEmbedSettings,
  SdkIframeEmbedTagMessage,
  SdkIframeEmbedTagSettings,
} from "./types/embed";

const EMBEDDING_ROUTE = "embed/sdk/v1";

class MetabaseEmbed {
  static readonly VERSION = "1.1.0";

  private _settings: SdkIframeEmbedTagSettings;
  private _isEmbedReady: boolean = false;
  private iframe: HTMLIFrameElement | null = null;

  private _eventHandlers: Map<
    SdkIframeEmbedEvent["type"],
    Set<SdkIframeEmbedEventHandler>
  > = new Map();

  constructor(settings: SdkIframeEmbedTagSettings) {
    this._settings = settings;
    this._settings._isLocalhost = this._getIsLocalhost();

    this._setup();
  }

  /**
   * Merge these settings with the current settings.
   */
  public updateSettings(settings: Partial<SdkIframeEmbedSettings>) {
    // The value of these fields must be the same as the initial value used to create an embed.
    // This allows users to pass a complete settings object that includes all their settings.
    for (const field of DISABLE_UPDATE_FOR_KEYS) {
      if (
        settings[field] !== undefined &&
        settings[field] !== this._settings[field]
      ) {
        raiseError(`${field} cannot be updated after the embed is created`);
      }
    }

    if (!this._isEmbedReady) {
      warn("embed settings must be ready before updating the settings");
      return;
    }

    this._setEmbedSettings(settings);
  }

  public destroy() {
    window.removeEventListener("message", this._handleMessage);
    this._isEmbedReady = false;
    this._eventHandlers.clear();

    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
  }

  public addEventListener(
    eventType: SdkIframeEmbedEvent["type"],
    handler: SdkIframeEmbedEventHandler,
  ) {
    if (!this._eventHandlers.has(eventType)) {
      this._eventHandlers.set(eventType, new Set());
    }

    // For the ready event, invoke the handler immediately if the embed is already ready.
    if (eventType === "ready" && this._isEmbedReady) {
      handler();
      return;
    }

    this._eventHandlers.get(eventType)!.add(handler);
  }

  public removeEventListener(
    eventType: SdkIframeEmbedEvent["type"],
    handler: SdkIframeEmbedEventHandler,
  ) {
    const handlers = this._eventHandlers.get(eventType);

    if (handlers) {
      handlers.delete(handler);

      if (handlers.size === 0) {
        this._eventHandlers.delete(eventType);
      }
    }
  }

  private _emitEvent(event: SdkIframeEmbedEvent) {
    const handlers = this._eventHandlers.get(event.type);

    if (handlers) {
      handlers.forEach((handler) => handler());
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
    if (!settings.instanceUrl) {
      raiseError("instanceUrl must be provided");
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

    // Ensure auth methods are mutually exclusive
    const authMethods = [
      settings.apiKey,
      settings.useExistingUserSession,
      settings.preferredAuthMethod,
    ].filter(
      (method) => method !== undefined && method !== null && method !== false,
    );

    if (authMethods.length > 1) {
      raiseError(
        "apiKey, useExistingUserSession, and preferredAuthMethod are mutually exclusive, only one can be specified.",
      );
    }

    if (!settings.target) {
      raiseError("target must be provided");
    }
  }

  private _handleMessage = async (
    event: MessageEvent<SdkIframeEmbedTagMessage>,
  ) => {
    if (!event.data) {
      return;
    }

    if (event.data.type === "metabase.embed.iframeReady") {
      if (this._isEmbedReady) {
        return;
      }

      this._isEmbedReady = true;
      this._setEmbedSettings(this._settings);
      this._emitEvent({ type: "ready" });
    }

    if (event.data.type === "metabase.embed.requestSessionToken") {
      await this._authenticate();
    }
  };

  private _sendMessage<Message extends SdkIframeEmbedMessage>(
    type: Message["type"],
    data: Message["data"],
  ) {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage({ type, data }, "*");
    }
  }

  private async _authenticate() {
    // If we are using an API key, we don't need to authenticate via SSO.
    if (this._settings.apiKey) {
      return;
    }

    try {
      const { method, sessionToken } = await this._getMetabaseSessionToken();
      validateSessionToken(sessionToken);

      if (sessionToken) {
        this._sendMessage("metabase.embed.submitSessionToken", {
          authMethod: method,
          sessionToken,
        });
      }
    } catch (error) {
      // if the error is an authentication error, show it to the iframe too
      if (error instanceof MetabaseError) {
        this._sendMessage("metabase.embed.reportAuthenticationError", {
          error,
        });
      }

      throw error;
    }
  }

  /**
   * @returns {{ method: "saml" | "jwt", sessionToken: {jwt: string} }}
   */
  private async _getMetabaseSessionToken() {
    const { instanceUrl, preferredAuthMethod } = this._settings;

    const urlResponseJson = await connectToInstanceAuthSso(instanceUrl, {
      headers: this._getAuthRequestHeader(),
      preferredAuthMethod,
    });

    const { method, url: responseUrl, hash } = urlResponseJson || {};

    if (method === "saml") {
      const sessionToken = await openSamlLoginPopup(responseUrl);

      return { method, sessionToken };
    }

    if (method === "jwt") {
      const sessionToken = await jwtDefaultRefreshTokenFunction(
        responseUrl,
        instanceUrl,
        this._getAuthRequestHeader(hash),
      );

      return { method, sessionToken };
    }

    throw INVALID_AUTH_METHOD({ method });
  }

  private _getAuthRequestHeader(hash?: string) {
    return {
      // eslint-disable-next-line no-literal-metabase-strings -- header name
      "X-Metabase-Client": "embedding-simple",

      // eslint-disable-next-line no-literal-metabase-strings -- header name
      ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
    };
  }
}

const raiseError = (message: string) => {
  throw new MetabaseError("EMBED_ERROR", message);
};

const warn = (...messages: unknown[]) =>
  console.warn("[metabase.embed.warning]", ...messages);

export { MetabaseEmbed };
