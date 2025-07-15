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
import { attributeToSettingKey, parseAttributeValue } from "./webcomponents";

const EMBEDDING_ROUTE = "embed/sdk/v1";

// BEGIN addition: global config & helper
const _globalEmbedConfig: Partial<SdkIframeEmbedSettings> = {};

export const defineMetabaseConfig = (
  config: Partial<SdkIframeEmbedSettings>,
) => {
  Object.assign(_globalEmbedConfig, config);
};
// END addition

class MetabaseEmbed {
  static readonly VERSION = "1.1.0";

  private _settings: SdkIframeEmbedTagSettings;
  private _isEmbedReady: boolean = false;
  private iframe: HTMLIFrameElement | null = null;

  public customClickHandler: ((number: number) => void) | null = null;

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

    // Merge incoming settings regardless of readiness so they're applied once the iframe signals ready.
    const allowedSettings = Object.fromEntries(
      Object.entries(settings).filter(([key]) =>
        ALLOWED_EMBED_SETTING_KEYS.includes(key as AllowedEmbedSettingKey),
      ),
    );

    // Update local cache first.
    this._settings = { ...this._settings, ...allowedSettings };

    // If the iframe isn't ready yet, don't send the message now.
    if (!this._isEmbedReady) {
      return;
    }

    // Iframe is ready – propagate only the delta (allowedSettings)
    if (Object.keys(allowedSettings).length > 0) {
      this._validateEmbedSettings(this._settings);
      this._sendMessage(
        "metabase.embed.setSettings",
        this._settings as SdkIframeEmbedSettings,
      );
    }
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
    // don't remove this! it's for debug
    console.log(">>>>>>this._settings", this._settings);
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

    if (event.data.type === "metabase.embed.customClick") {
      console.log(
        "[internal] metabase.embed.customClick",
        event.data.data.number,
      );
      if (this.customClickHandler) {
        this.customClickHandler(event.data.data.number);
      }
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
      "X-Metabase-Client": "embedding-sdk-react",

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

// BEGIN web-component wrapper for convenient usage via <metabase-embed> tag

class MetabaseEmbedElement extends HTMLElement {
  private _embed: MetabaseEmbed | null = null;

  private _BUFFER_customClickHandler: ((number: number) => void) | null = null;

  // Keep the observed attributes list small & explicit to avoid mistakes.
  // Only attributes that map to settings are included.
  static get observedAttributes() {
    return [
      "instance-url",
      "dashboard-id",
      "question-id",
      "template",
      "initial-collection",
      "is-drill-through-enabled",
      "with-downloads",
      "with-title",
      "use-existing-user-session",
      "api-key",
      "preferred-auth-method",
      "iframe-class-name",
      "initial-parameters",
      "theme",
    ];
  }

  // Property <-> attribute reflection for complex settings
  /**
   * An array of parameter ids that will be passed to the embedded dashboard.
   *
   * Example: element.initialParameters = ["param_1", "param_2"]
   * This automatically serializes the value to JSON and sets the
   * `initial-parameters` attribute so the attributeChangedCallback can handle
   * updating the underlying embed instance.
   */
  get initialParameters(): Record<string, unknown> | undefined {
    const attr = this.getAttribute("initial-parameters");
    if (attr === null) {
      return undefined;
    }
    try {
      return JSON.parse(attr) as Record<string, unknown>;
    } catch (error) {
      console.error(
        "[metabase.embed.error] Failed to parse initial-parameters attribute as JSON",
        error,
      );
      return undefined;
    }
  }

  set initialParameters(value: Record<string, unknown> | undefined) {
    if (value === undefined) {
      this.removeAttribute("initial-parameters");
      return;
    }

    // Serialize to JSON for consistency with attribute parsing logic
    this.setAttribute("initial-parameters", JSON.stringify(value));
  }

  get customClickHandler(): ((number: number) => void) | null {
    return this._embed?.customClickHandler ?? null;
  }

  set customClickHandler(value: ((number: number) => void) | null) {
    console.log(
      `!!!! setting customClickHandler, this._embed is ${this._embed}, value being passed is`,
      value,
    );
    if (this._embed) {
      this._embed.customClickHandler = value;
    } else {
      console.log("embed is null, setting the buffer");
      this._BUFFER_customClickHandler = value;
    }
  }

  get theme(): Record<string, unknown> | undefined {
    const attr = this.getAttribute("theme");
    if (attr === null) {
      return undefined;
    }
    try {
      return JSON.parse(attr) as Record<string, unknown>;
    } catch (error) {
      console.error(
        "[metabase.embed.error] Failed to parse theme attribute as JSON",
        error,
      );
      return undefined;
    }
  }

  set theme(value: Record<string, unknown> | undefined) {
    console.log("setting theme", value);
    if (value === undefined) {
      this.removeAttribute("theme");
      return;
    }
    this.setAttribute("theme", JSON.stringify(value));
  }

  connectedCallback() {
    if (this._embed) {
      return; // already initialised
    }

    // Gather settings from element attributes
    const settings: Record<string, unknown> = {};
    Array.from(this.attributes).forEach(({ name, value }) => {
      const key = attributeToSettingKey(name);
      settings[key] = parseAttributeValue(value);
    });

    // BEGIN addition: apply global defaults
    Object.entries(_globalEmbedConfig).forEach(([key, value]) => {
      if (settings[key] === undefined) {
        settings[key] = value;
      }
    });
    // END addition

    // Fallback: if no instanceUrl attribute on element, look for it on the embedding script tag.
    if (!settings.instanceUrl) {
      const scriptWithInstance = document.querySelector(
        "script[data-metabase-instance-url]",
      ) as HTMLScriptElement | null;

      const attr = scriptWithInstance?.getAttribute(
        "data-metabase-instance-url",
      );

      if (attr) {
        settings.instanceUrl = attr;
      }
    }

    // Fallback: global attribute for useExistingUserSession
    if (settings.useExistingUserSession === undefined) {
      const scriptWithUserSession = document.querySelector(
        "script[data-metabase-use-existing-user-session]",
      ) as HTMLScriptElement | null;

      const attr = scriptWithUserSession?.getAttribute(
        "data-metabase-use-existing-user-session",
      );

      if (attr !== null && attr !== undefined) {
        settings.useExistingUserSession = parseAttributeValue(attr) as boolean;
      }
    }

    // Default target is a selector string pointing to this element to avoid passing an
    // HTMLElement (which cannot be cloned in postMessage payloads).
    if (!this.id) {
      // Ensure the element has an id we can reference.
      this.id = `metabase-embed-${Math.random().toString(36).slice(2)}`;
    }
    settings.target = `#${this.id}`;

    // Instantiate the SDK embed.
    try {
      this._embed = new MetabaseEmbed(
        settings as unknown as SdkIframeEmbedTagSettings,
      );

      // Add click handler if one was set before the embed was created
      console.log(" SETTING UP SOMETHING, THERE IS SOMETHING IN THE BUFFER");
      if (this._BUFFER_customClickHandler) {
        this._embed.customClickHandler = this._BUFFER_customClickHandler;
      }
    } catch (error) {
      // Surface constructor errors for easier debugging.
      console.error("[metabase.embed.error]", error);
    }
  }

  disconnectedCallback() {
    this._embed?.destroy();
    this._embed = null;
  }

  attributeChangedCallback(
    attrName: string,
    oldVal: string | null,
    newVal: string | null,
  ) {
    if (!this._embed || oldVal === newVal) {
      return;
    }

    const key = attributeToSettingKey(attrName) as keyof SdkIframeEmbedSettings;

    // Prevent updates to settings that are immutable after creation.
    if (
      (DISABLE_UPDATE_FOR_KEYS as readonly string[]).includes(key as string)
    ) {
      return;
    }

    const value = parseAttributeValue(newVal);
    // Call updateSettings with a partial settings object.
    try {
      this._embed.updateSettings({
        [key]: value,
      } as Partial<SdkIframeEmbedSettings>);
    } catch (error) {
      console.error("[metabase.embed.error]", error);
    }
  }
}

// Register the custom element once in the current page context.
if (typeof window !== "undefined" && !customElements.get("metabase-embed")) {
  customElements.define("metabase-embed", MetabaseEmbedElement);
}

// BEGIN addition: <metabase-config> element to define global config via HTML tag
class MetabaseConfigElement extends HTMLElement {
  connectedCallback() {
    const settings: Record<string, unknown> = {};
    Array.from(this.attributes).forEach(({ name, value }) => {
      const key = attributeToSettingKey(name);
      settings[key] = parseAttributeValue(value);
    });

    try {
      defineMetabaseConfig(settings as Partial<SdkIframeEmbedSettings>);
    } catch (error) {
      console.error("[metabase.embed.error]", error);
    }
  }
}

if (typeof window !== "undefined" && !customElements.get("metabase-config")) {
  customElements.define("metabase-config", MetabaseConfigElement);
}
// END addition

// Register aliases for convenience without reusing the same constructor (required by the spec)
if (typeof window !== "undefined") {
  ["metabase-question", "metabase-dashboard"].forEach((tag) => {
    if (!customElements.get(tag)) {
      // Create a unique subclass so each tag has its own constructor reference.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – dynamically generated class name is fine.
      customElements.define(tag, class extends MetabaseEmbedElement {});
    }
  });
}

// Expose the constructor on the global for backwards compatibility with previous SDK usage.
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any)["metabase.embed"] = {
    // Preserve any existing exports placed there earlier.
    ...(window as any)["metabase.embed"],
    MetabaseEmbed,
    defineMetabaseConfig,
  };
}
// END web-component wrapper

export { MetabaseEmbed, MetabaseEmbedElement };

// todo:
/**
 * - decide if we want to hoist up the shared configs not related to the individual embed
 * - decide how to define themes etc
 * - decide about plugins/callbacks
 * - what to do with initialParams etc
 */
