import { MetabaseError, SSO_NOT_ALLOWED } from "embedding-sdk-bundle/errors";
import { PLUGIN_EMBED_JS_EE } from "metabase/embedding/embedding-iframe-sdk/plugin";
import type {
  EmbedAuthManager,
  EmbedAuthManagerContext,
} from "metabase/embedding/embedding-iframe-sdk/types/auth-manager";

import { debouncedReportAnalytics } from "./analytics";
import {
  ALLOWED_EMBED_SETTING_KEYS_MAP,
  DISABLE_UPDATE_FOR_KEYS,
  METABASE_CONFIG_IS_PROXY_FIELD_NAME,
} from "./constants";
import type {
  SdkIframeEmbedElementSettings,
  SdkIframeEmbedEvent,
  SdkIframeEmbedEventHandler,
  SdkIframeEmbedMessage,
  SdkIframeEmbedSettings,
  SdkIframeEmbedTagMessage,
} from "./types/embed";
import { attributeToSettingKey, parseAttributeValue } from "./webcomponents";

// Import EE Iframe Embedding script plugins
import "sdk-iframe-embedding-script-ee-plugins";

const EMBEDDING_ROUTE = "embed/sdk/v1";

/** list of active embeds, used to know which embeds to update when the global config changes */
const _activeEmbeds: Set<MetabaseEmbedElement> = new Set();

/** counter used as a parameter in the iframe src to force parallel loading */
let _iframeCounter = 0;

// Setup a proxy to watch for changes to window.metabaseConfig and update all
// active embeds when the config changes. It also setups a setter for
// window.metabaseConfig to re-create the proxy if the whole object is replaced,
// for example if this script is loaded before the customer calls
// `defineMetabaseConfig` in their code, which replaces the entire object.
export const setupConfigWatcher = () => {
  const createProxy = (target: Record<string, unknown>) =>
    new Proxy(target, {
      get(target, prop, receiver) {
        // Needed for EmbedJS Wizard to call setupConfigWatcher on the Wizard reinitialization
        if (prop === METABASE_CONFIG_IS_PROXY_FIELD_NAME) {
          return true;
        }

        return Reflect.get(target, prop, receiver);
      },
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
      assertValidMetabaseConfigField(newVal);

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

export const updateAllEmbeds = (
  config: Partial<SdkIframeEmbedElementSettings>,
) => {
  assertFieldCanBeUpdated(config);

  _activeEmbeds.forEach((embedElement) => {
    embedElement._updateSettings(config);
  });
};

const registerEmbed = (embed: MetabaseEmbedElement) => {
  _activeEmbeds.add(embed);
  debouncedReportAnalytics(_activeEmbeds);
};

const unregisterEmbed = (embed: MetabaseEmbedElement) => {
  _activeEmbeds.delete(embed);
};

if (typeof window !== "undefined") {
  setupConfigWatcher();
}

const raiseError = (message: string) => {
  throw new MetabaseError("EMBED_TAG_ERROR", message);
};

function assertFieldCanBeUpdated(
  newValues: Partial<SdkIframeEmbedElementSettings>,
) {
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

type AllowedMetabaseConfigKey =
  (typeof ALLOWED_EMBED_SETTING_KEYS_MAP.base)[number];

function assertValidMetabaseConfigField(
  newValues: Partial<SdkIframeEmbedElementSettings>,
) {
  for (const field in newValues) {
    if (
      !ALLOWED_EMBED_SETTING_KEYS_MAP.base.includes(
        field as AllowedMetabaseConfigKey,
      )
    ) {
      raiseError(`${field} is not a valid configuration name`);
    }
  }
}

export abstract class MetabaseEmbedElement
  extends HTMLElement
  implements EmbedAuthManagerContext
{
  private _iframe: HTMLIFrameElement | null = null;
  protected abstract _componentName: string;
  protected abstract _attributeNames: readonly string[];

  static readonly VERSION = "1.1.0";

  private _isEmbedReady: boolean = false;
  private _eventHandlers: Map<
    SdkIframeEmbedEvent["type"],
    Set<SdkIframeEmbedEventHandler>
  > = new Map();
  private _authManager: EmbedAuthManager | null = null;

  get globalSettings() {
    return (window as any).metabaseConfig || {};
  }

  // returns the attributes converted to camelCase + global settings
  get properties(): SdkIframeEmbedElementSettings {
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
    } as SdkIframeEmbedElementSettings;
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
  _updateSettings(settings: Partial<SdkIframeEmbedElementSettings>) {
    const newValues = {
      ...this.properties,
      ...settings,
    } as SdkIframeEmbedElementSettings;

    // If the iframe isn't ready yet, don't send the message now.
    if (!this._isEmbedReady) {
      return;
    }

    this._validateEmbedSettings(newValues);

    // Iframe is ready – propagate the delta
    this.sendMessage(
      "metabase.embed.setSettings",
      // When we properly fix the type for Exploration template which uses `questionId: "new"` on the custom element, we should remove this type casting.
      newValues as SdkIframeEmbedSettings,
    );
  }

  destroy() {
    window.removeEventListener("message", this._handleMessage);
    this._isEmbedReady = false;
    this._eventHandlers.clear();
    this._authManager = null;

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

    const key = attributeToSettingKey(
      attrName,
    ) as keyof SdkIframeEmbedElementSettings;
    if (
      (DISABLE_UPDATE_FOR_KEYS as readonly string[]).includes(key as string)
    ) {
      console.error(`${key} cannot be updated after the embed is created`);
      return;
    }

    this._updateSettings({
      [key]: parseAttributeValue(newVal),
    } as Partial<SdkIframeEmbedElementSettings>);
  }

  private _emitEvent(event: SdkIframeEmbedEvent) {
    const handlers = this._eventHandlers.get(event.type);

    if (handlers) {
      handlers.forEach((handler) => handler());
    }
  }

  private _setup() {
    this._validateEmbedSettings(this.properties);

    // Initialize the auth manager
    this._authManager = PLUGIN_EMBED_JS_EE.EmbedAuthManager
      ? new PLUGIN_EMBED_JS_EE.EmbedAuthManager(this)
      : null;

    this._iframe = document.createElement("iframe");
    // Random query param is needed to allow parallel EmbedJS iframes loading.
    // Without it multiple EmbedJS iframes on a page loaded sequentially.
    // We don't cache the iframe content, so random query parameter does not break caching.
    this._iframe.src = `${this.globalSettings.instanceUrl}/${EMBEDDING_ROUTE}?v=${_iframeCounter++}`;
    this._iframe.style.width = "100%";
    this._iframe.style.height = "100%";
    this._iframe.style.border = "none";
    this._iframe.style.minHeight = "600px";

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

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  }

  private _validateEmbedSettings(settings: SdkIframeEmbedElementSettings) {
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

  sendMessage<Message extends SdkIframeEmbedMessage>(
    type: Message["type"],
    data: Message["data"],
  ) {
    if (this._iframe?.contentWindow) {
      const normalizedData = Object.entries(data).reduce(
        (acc, [key, value]) => {
          // Functions are not serializable, so we ignore them.
          if (typeof value === "function") {
            return acc;
          }

          acc[key as keyof typeof acc] = value;

          return acc;
        },
        {} as Message["data"],
      );

      this._iframe.contentWindow.postMessage(
        { type, data: normalizedData },
        "*",
      );
    }
  }

  private async _authenticate() {
    if (!this._authManager) {
      this.sendMessage("metabase.embed.reportAuthenticationError", {
        error: SSO_NOT_ALLOWED(),
      });

      return;
    }

    await this._authManager.authenticate();
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
  "token",
  "auto-refresh-interval",
  "with-title",
  "with-downloads",
  "with-subscriptions",
  "drills",
  "initial-parameters",
  "hidden-parameters",
]);

const MetabaseQuestionElement = createCustomElement("metabase-question", [
  "question-id",
  "token",
  "with-title",
  "with-downloads",
  "with-alerts",
  "drills",
  "initial-sql-parameters",
  "hidden-parameters",
  "is-save-enabled",
  "target-collection",
  "entity-types",
]);

const MetabaseManageContentElement = createCustomElement("metabase-browser", [
  "initial-collection",
  "collection-visible-columns",
  "collection-page-size",
  "collection-entity-types",
  "data-picker-entity-types",
  "with-new-question",
  "with-new-dashboard",
  "read-only",
]);

const MetabaseMetabotElement = createCustomElement("metabase-metabot", [
  "layout",
]);

// Expose the old API that's still used in the tests, we'll probably remove this api unless customers prefer it
if (typeof window !== "undefined") {
  (window as any)["metabase.embed"] = {
    ...(window as any)["metabase.embed"],
  };
}

export {
  MetabaseDashboardElement,
  MetabaseQuestionElement,
  MetabaseManageContentElement,
  MetabaseMetabotElement,
};
