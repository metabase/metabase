import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
  openSamlLoginPopup,
  validateSessionToken,
} from "embedding/auth-common";
import { INVALID_AUTH_METHOD, MetabaseError } from "embedding-sdk/errors";

import { DISABLE_UPDATE_FOR_KEYS } from "./constants";
import type {
  SdkIframeEmbedEvent,
  SdkIframeEmbedEventHandler,
  SdkIframeEmbedMessage,
  SdkIframeEmbedSettings,
  SdkIframeEmbedTagMessage,
} from "./types/embed";
import { attributeToSettingKey, parseAttributeValue } from "./webcomponents";

const EMBEDDING_ROUTE = "embed/sdk/v1";

/** list of active embeds, used to know which embeds to update when the global config changes */
const _activeEmbeds: Set<MetabaseEmbedElement> = new Set();

// Setup a proxy to watch for changes to window.metabaseConfig and update all
// active embeds when the config changes. It also setups a setter for
// window.metabaseConfig to re-create the proxy if the whole object is replaced,
// for example if this script is loaded before the customer calls
// `defineMetabaseConfig` in their code, which replaces the entire object.
const setupConfigWatcher = () => {
  const createProxy = (target: Record<string, unknown>) =>
    new Proxy(target, {
      set(metabaseConfig, prop, newValue) {
        metabaseConfig[prop as string] = newValue;
        updateAllEmbeds({ [prop]: newValue });
        return true;
      },
    });

  let currentConfig = (window as any).metabaseConfig || {};
  let proxyConfig: Record<string, unknown> = createProxy(currentConfig);

  Object.defineProperty(window, "metabaseConfig", {
    configurable: true,
    enumerable: true,
    get() {
      return proxyConfig;
    },
    set(newVal: Record<string, unknown>) {
      assertFieldCanBeUpdated(newVal);

      currentConfig = { ...currentConfig, ...newVal };
      proxyConfig = createProxy(currentConfig);
      updateAllEmbeds(currentConfig);
    },
  });

  // Trigger initial update if there was existing config
  if (Object.keys(currentConfig).length > 0) {
    updateAllEmbeds(currentConfig);
  }
};

export const updateAllEmbeds = (config: Partial<SdkIframeEmbedSettings>) => {
  assertFieldCanBeUpdated(config);

  _activeEmbeds.forEach((embedElement) => {
    embedElement._updateSettings(config);
  });
};

const registerEmbed = (embed: MetabaseEmbedElement) => {
  _activeEmbeds.add(embed);
};

const unregisterEmbed = (embed: MetabaseEmbedElement) => {
  _activeEmbeds.delete(embed);
};

if (typeof window !== "undefined") {
  setupConfigWatcher();
}

const raiseError = (message: string) => {
  throw new MetabaseError("EMBED_ERROR", message);
};

function assertFieldCanBeUpdated(newValues: Partial<SdkIframeEmbedSettings>) {
  const currentConfig = (window as any).metabaseConfig || {};
  for (const field of DISABLE_UPDATE_FOR_KEYS) {
    if (
      currentConfig[field] !== undefined &&
      newValues[field] !== undefined && // we allow passing a partial update
      currentConfig[field] !== newValues[field]
    ) {
      raiseError(`${field} cannot be updated after the embed is created`);
    }
  }
}

export abstract class MetabaseEmbedElement extends HTMLElement {
  private _iframe: HTMLIFrameElement | null = null;
  protected abstract _componentName: string;
  protected abstract _attributeNames: readonly string[];

  static readonly VERSION = "1.1.0";

  private _isEmbedReady: boolean = false;
  private _eventHandlers: Map<
    SdkIframeEmbedEvent["type"],
    Set<SdkIframeEmbedEventHandler>
  > = new Map();

  get globalSettings() {
    return (window as any).metabaseConfig || {};
  }

  // returns the attributes converted to camelCase + global settings
  get properties(): SdkIframeEmbedSettings {
    const attributesConverted = this._attributeNames.reduce(
      (acc, attr) => {
        const attrValue = this.getAttribute(attr as string);
        if (attrValue !== null) {
          const key = attributeToSettingKey(attr as string);
          acc[key] = parseAttributeValue(attrValue);
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );

    return {
      ...this.globalSettings,
      ...attributesConverted,
      componentName: this._componentName,
      _isLocalhost: this._getIsLocalhost(),
    } as SdkIframeEmbedSettings;
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | SdkIframeEmbedEventHandler,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type === "ready") {
      const eventType = type as SdkIframeEmbedEvent["type"];
      const handler = listener as SdkIframeEmbedEventHandler;
      if (!this._eventHandlers.has(eventType)) {
        this._eventHandlers.set(eventType, new Set());
      }

      // For the ready event, invoke the handler immediately if the embed is already ready.
      if (eventType === "ready" && this._isEmbedReady) {
        handler();
        return;
      }

      this._eventHandlers.get(eventType)!.add(handler);
      return;
    }

    // Fall back to the native HTMLElement event mechanism for all other events.
    super.addEventListener(
      type,
      listener as EventListenerOrEventListenerObject,
      options,
    );
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | SdkIframeEmbedEventHandler,
    options?: boolean | EventListenerOptions,
  ): void {
    if (type === "ready") {
      const eventType = type as SdkIframeEmbedEvent["type"];
      const handler = listener as SdkIframeEmbedEventHandler;
      const handlers = this._eventHandlers.get(eventType);

      if (handlers) {
        handlers.delete(handler);

        if (handlers.size === 0) {
          this._eventHandlers.delete(eventType);
        }
      }
      return;
    }

    super.removeEventListener(
      type,
      listener as EventListenerOrEventListenerObject,
      options,
    );
  }

  /**
   * Send a message with the new settings
   */
  _updateSettings(settings: Partial<SdkIframeEmbedSettings>) {
    const newValues = {
      ...this.properties,
      ...settings,
    } as SdkIframeEmbedSettings;

    // If the iframe isn't ready yet, don't send the message now.
    if (!this._isEmbedReady) {
      return;
    }

    this._validateEmbedSettings(newValues);

    // Iframe is ready – propagate the delta
    this._sendMessage("metabase.embed.setSettings", newValues);
  }

  destroy() {
    window.removeEventListener("message", this._handleMessage);
    this._isEmbedReady = false;
    this._eventHandlers.clear();

    if (this._iframe) {
      this._iframe.remove();
      this._iframe = null;
    }
  }

  connectedCallback() {
    this.style.display = "block";

    if (this._iframe) {
      // already initialised
      return;
    }

    if (!this.id) {
      this.id = `metabase-embed-${Math.random().toString(36).slice(2)}`;
    }

    try {
      this._setup();

      registerEmbed(this);
    } catch (error) {
      console.error("[metabase.embed.error]", error);
    }
  }

  disconnectedCallback() {
    this.destroy();
    unregisterEmbed(this);
  }

  attributeChangedCallback(
    attrName: string,
    oldVal: string | null,
    newVal: string | null,
  ) {
    if (!this._iframe || oldVal === newVal) {
      return;
    }

    const key = attributeToSettingKey(attrName) as keyof SdkIframeEmbedSettings;
    if (
      (DISABLE_UPDATE_FOR_KEYS as readonly string[]).includes(key as string)
    ) {
      console.error(`${key} cannot be updated after the embed is created`);
      return;
    }

    this._updateSettings({
      [key]: parseAttributeValue(newVal),
    } as Partial<SdkIframeEmbedSettings>);
  }

  private _emitEvent(event: SdkIframeEmbedEvent) {
    const handlers = this._eventHandlers.get(event.type);

    if (handlers) {
      handlers.forEach((handler) => handler());
    }
  }

  private _setup() {
    this._validateEmbedSettings(this.properties);

    this._iframe = document.createElement("iframe");
    this._iframe.src = `${this.globalSettings.instanceUrl}/${EMBEDDING_ROUTE}`;
    this._iframe.style.width = "100%";
    this._iframe.style.height = "100%";
    this._iframe.style.border = "none";

    this._iframe.setAttribute("data-metabase-embed", "true");

    window.addEventListener("message", this._handleMessage);

    this.appendChild(this._iframe);
  }

  private _getIsLocalhost() {
    const { hostname } = window.location;

    try {
      if (!this.globalSettings.instanceUrl) {
        // if not configured yet, we return true to avoid throwing
        return true;
      }

      const instanceUrl = new URL(this.globalSettings.instanceUrl);

      if (hostname === instanceUrl.hostname) {
        return true;
      }
    } catch (error) {
      console.error("unable to construct the URL:", error);
    }

    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  private _validateEmbedSettings(settings: SdkIframeEmbedSettings) {
    if (!settings.instanceUrl) {
      raiseError("instanceUrl must be provided");
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
  }

  private _handleMessage = async (
    event: MessageEvent<SdkIframeEmbedTagMessage>,
  ) => {
    if (event.source !== this._iframe?.contentWindow) {
      // ignore messages from other iframes
      return;
    }

    if (!event.data) {
      return;
    }

    if (event.data.type === "metabase.embed.iframeReady") {
      if (this._isEmbedReady) {
        return;
      }

      this._isEmbedReady = true;
      if (this._iframe) {
        // this is used from tests to await the loading of the iframe
        this._iframe.setAttribute("data-iframe-loaded", "true");
      }
      this._updateSettings(this.properties);
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
    if (this._iframe?.contentWindow) {
      this._iframe.contentWindow.postMessage({ type, data }, "*");
    }
  }

  private async _authenticate() {
    // If we are using an API key, we don't need to authenticate via SSO.
    if (this.properties.apiKey) {
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
    }
  }

  /**
   * @returns {{ method: "saml" | "jwt", sessionToken: {jwt: string} }}
   */
  private async _getMetabaseSessionToken() {
    const { instanceUrl, preferredAuthMethod } = this.properties;

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

function createCustomElement<Arr extends readonly string[]>(
  componentName: string,
  attributeNames: Arr,
) {
  const CustomEmbedElement = class extends MetabaseEmbedElement {
    protected _componentName: string = componentName;
    protected _attributeNames: readonly string[] = attributeNames;

    static get observedAttributes() {
      return attributeNames as readonly string[];
    }
  };

  if (typeof window !== "undefined" && !customElements.get(componentName)) {
    customElements.define(componentName, CustomEmbedElement);
  }

  return CustomEmbedElement;
}

const MetabaseDashboardElement = createCustomElement("metabase-dashboard", [
  "dashboard-id",
  "with-title",
  "with-downloads",
  "drills",
  "initial-parameters",
  "hidden-parameters",
]);

const MetabaseQuestionElement = createCustomElement("metabase-question", [
  "question-id",
  "with-title",
  "with-downloads",
  "drills",
  "initial-sql-parameters",
  "is-save-enabled",
  "target-collection",
  "entity-types",
]);

// Expose the old API that's still used in the tests, we'll probably remove this api unless customers prefer it
if (typeof window !== "undefined") {
  (window as any)["metabase.embed"] = {
    ...(window as any)["metabase.embed"],
  };
}

export { MetabaseDashboardElement, MetabaseQuestionElement };
