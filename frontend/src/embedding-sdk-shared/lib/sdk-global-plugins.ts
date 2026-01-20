import { requestHandleLinkFromEmbedJs } from "metabase/embedding/embedding-iframe-sdk/utils/request-handle-link";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";

import { ensureMetabaseProviderPropsStore } from "./ensure-metabase-provider-props-store";

type HandleLinkFn = (url: string) => { handled: boolean };

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

/**
 * Invokes the handleLink plugin if configured in the host app and returns an object with a 'handled' property, indicating if the host app handled the link.
 * For iframe SDK, this sends a postMessage to the parent window and awaits the response.
 */
export async function handleLinkSdkPlugin(
  url: string,
): Promise<{ handled: boolean }> {
  // In iframe SDK mode, send a message to the parent window
  if (isEmbeddingEajs()) {
    return requestHandleLinkFromEmbedJs(url);
  }

  // React SDK mode - use the global plugins
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
