import type { MetabaseProviderPropsStoreExternalProps } from "embedding-sdk-bundle/components/public/ComponentProvider";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";

import { TEST_PROVIDER_NAME } from "./constants";

type MockSdkStore = {
  getState: () => undefined;
  subscribe: (listener: () => void) => () => void;
};

const MOCK_SDK_STORE: MockSdkStore = {
  getState: () => undefined,
  subscribe: () => () => undefined,
};

function getPropsStore() {
  return ensureMetabaseProviderPropsStore<
    MetabaseProviderPropsStoreExternalProps,
    MockSdkStore
  >();
}

export function installMockSdk(bundle: MetabaseEmbeddingSdkBundleExports) {
  const win = getWindow();

  if (!win) {
    return () => undefined;
  }

  if (win.METABASE_EMBEDDING_SDK_BUNDLE) {
    throw new Error(
      `An SDK bundle is already installed. Render one ${TEST_PROVIDER_NAME} at a time.`,
    );
  }

  win.METABASE_EMBEDDING_SDK_BUNDLE = bundle;

  const propsStore = getPropsStore();
  propsStore.setProps({});
  propsStore.updateInternalProps({
    reduxStore: MOCK_SDK_STORE,
    loadingState: SdkLoadingState.Initialized,
    loadingError: null,
  });

  return () => {
    delete win.METABASE_EMBEDDING_SDK_BUNDLE;
    getPropsStore().cleanup();
  };
}
