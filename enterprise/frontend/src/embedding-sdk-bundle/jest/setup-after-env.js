import { ensureMetabaseProviderPropsStore } from "embedding-sdk-bundle/sdk-shared/lib/ensure-metabase-provider-props-store";

afterEach(() => {
  ensureMetabaseProviderPropsStore().cleanup();
});
