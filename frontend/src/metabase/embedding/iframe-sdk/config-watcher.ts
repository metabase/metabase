import {
  ALLOWED_EMBED_SETTING_KEYS_MAP,
  DISABLE_UPDATE_FOR_KEYS,
  METABASE_CONFIG_IS_PROXY_FIELD_NAME,
} from "./constants";
import type { SdkIframeEmbedElementSettings } from "./types/embed";

// Shared (non-enforced) tier: avoid pulling `embedding-sdk-bundle` into shared.
// Use a plain Error here — assertions only fire on developer misuse (invalid
// config field, mutating a locked field); consumer-visible errors still flow
// through MetabaseError in the runtime `embed.ts`.
const raiseError = (message: string) => {
  throw new Error(`[metabase-embed] ${message}`);
};

export function assertFieldCanBeUpdated(
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

export function assertValidMetabaseConfigField(
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

// Setup a proxy to watch for changes to window.metabaseConfig and invoke the
// callback when the config changes. It also sets up a setter for
// window.metabaseConfig to re-create the proxy if the whole object is replaced,
// for example if this script is loaded before the customer calls
// `defineMetabaseConfig` in their code, which replaces the entire object.
export const setupConfigWatcher = (
  onConfigChange: (config: Partial<SdkIframeEmbedElementSettings>) => void,
) => {
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
        onConfigChange({
          [prop as string]: newValue,
        } as Partial<SdkIframeEmbedElementSettings>);
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
      assertFieldCanBeUpdated(newVal as Partial<SdkIframeEmbedElementSettings>);
      assertValidMetabaseConfigField(
        newVal as Partial<SdkIframeEmbedElementSettings>,
      );

      currentConfig = { ...currentConfig, ...newVal };
      proxyConfig = createProxy(currentConfig);
      onConfigChange(currentConfig);
    },
  });

  // Trigger initial update if there was existing config
  if (Object.keys(currentConfig).length > 0) {
    onConfigChange(currentConfig);
  }
};
