import { ensureMetabaseProviderPropsStore } from "./ensure-metabase-provider-props-store";

// On the SDK side, we ask customers for a sync function but in EAJS we actually
// need an async function internally. Typescript doesn't really like it unless
// we specify both versions
type HandleLinkFn = (
  url: string,
) => { handled: boolean } | Promise<{ handled: boolean }>;

type SdkGlobalPlugins = {
  handleLink?: HandleLinkFn;
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

export const MODULAR_EMBEDDING_HANDLE_LINK_PLUGIN: {
  handleLink: HandleLinkFn;
} = {
  handleLink: (_url: string) => Promise.resolve({ handled: false }),
};

/**
 * Invokes the handleLink plugin if configured in the host app and returns an object with a 'handled' property, indicating if the host app handled the link.
 * For iframe SDK, this sends a postMessage to the parent window and awaits the response.
 */
export async function handleLinkSdkPlugin(url: string) {
  return await MODULAR_EMBEDDING_HANDLE_LINK_PLUGIN.handleLink(url);
}
