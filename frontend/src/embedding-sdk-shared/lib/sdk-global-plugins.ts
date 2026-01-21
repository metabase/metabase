import { isEmbeddingEajs, isEmbeddingSdk } from "metabase/embedding-sdk/config";

import { EAJSSettingsStore } from "./eajs-settings-store";
import { ensureMetabaseProviderPropsStore } from "./ensure-metabase-provider-props-store";

type HandleLinkFn = (url: string) => { handled: boolean };

type SdkGlobalPlugins = {
  handleLink?: HandleLinkFn;
  enableInternalNavigation?: boolean;
};

export type SdkGlobalPluginsAndOptions = {
  enableInternalNavigation?: boolean;
  plugins: SdkGlobalPlugins;
};

// `MetabaseProvider` and most of the sdk code are in two different bundles,
// this means we can't use an exported object as singleton to share the global
// plugins between them. This function uses `ensureMetabaseProviderPropsStore`
// to access the provider props across bundles
export const getSdkGlobalPluginsAndOptions = (): SdkGlobalPluginsAndOptions => {
  // TODO: SDK and EAJS should store data in the same place
  if (isEmbeddingEajs()) {
    return {
      plugins: {},
      enableInternalNavigation:
        EAJSSettingsStore.getState().enableInternalNavigation,
    };
  }

  if (isEmbeddingSdk()) {
    const props = ensureMetabaseProviderPropsStore().getState().props;
    return {
      plugins: props?.pluginsConfig || {},
      enableInternalNavigation: props?.enableInternalNavigation || false,
    };
  }

  return {
    plugins: {},
    enableInternalNavigation: false,
  };
};

/**
 * Invokes the handleLink plugin if configured in the host app and returns an object with a 'handled' property, indicating if the host app handled the link.
 */
export function handleLinkSdkPlugin(url: string): { handled: boolean } {
  const { plugins } = getSdkGlobalPluginsAndOptions();

  if (!plugins?.handleLink) {
    return { handled: false };
  }

  const result = plugins.handleLink(url);

  if (!result || typeof result !== "object" || !("handled" in result)) {
    throw new Error(
      "handleLink plugin must return an object with a 'handled' property",
    );
  }

  return result;
}
