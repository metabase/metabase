import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";

afterEach(() => {
  ensureMetabaseProviderPropsStore().cleanup();
});
