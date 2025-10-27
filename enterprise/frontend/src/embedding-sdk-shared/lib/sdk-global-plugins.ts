import { ensureMetabaseProviderPropsStore } from "./ensure-metabase-provider-props-store";

type HandleLinkFn = (url: string) => boolean;

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
