import type { MetabaseProviderPropsStoreExternalProps } from "embedding-sdk-bundle/components/public/ComponentProvider";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { useMetabaseProviderPropsStore as useMetabaseProviderPropsStoreBase } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { ensureMetabaseProviderPropsStore as ensureMetabaseProviderPropsStoreBase } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";

/**
 * The shared store carries an opaque payload. These aliases pin the bundle's
 * concrete types (type-only imports) so call sites stay fully typed. Both
 * artifacts must compile against the same bundle version; see the compatibility
 * note in the shared store.
 */
export const ensureMetabaseProviderPropsStore = () =>
  ensureMetabaseProviderPropsStoreBase<
    MetabaseProviderPropsStoreExternalProps,
    SdkStore
  >();

export const useMetabaseProviderPropsStore = () =>
  useMetabaseProviderPropsStoreBase<
    MetabaseProviderPropsStoreExternalProps,
    SdkStore
  >();
