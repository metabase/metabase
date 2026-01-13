import { ensureMetabaseProviderPropsStore } from "./ensure-metabase-provider-props-store";

type HandleLinkFn = (url: string) => { handled: boolean };

type SdkGlobalPlugins = {
  handleLink?: HandleLinkFn;
  enableInternalNavigation?: boolean;
};

// `MetabaseProvider` and most of the sdk code are in two different bundles,
// this means we can't use an exported object as singleton to share the global
// plugins between them. This function uses `ensureMetabaseProviderPropsStore`
// to access the provider props across bundles
export const getSdkGlobalPlugins = (): SdkGlobalPlugins => {
  return (
    ensureMetabaseProviderPropsStore().getState().props?.pluginsConfig || {}
  );
};

/**
 * Invokes the handleLink plugin if configured in the host app and returns an object with a 'handled' property, indicating if the host app handled the link.
 */
export function handleLinkSdkPlugin(url: string): { handled: boolean } {
  const globalPlugins = getSdkGlobalPlugins();

  if (!globalPlugins?.handleLink) {
    return { handled: false };
  }

  const result = globalPlugins.handleLink(url);

  if (!result || typeof result !== "object" || !("handled" in result)) {
    throw new Error(
      "handleLink plugin must return an object with a 'handled' property",
    );
  }

  return result;
}
