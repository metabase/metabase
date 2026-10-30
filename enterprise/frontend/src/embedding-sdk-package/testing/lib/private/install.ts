import type { MetabaseProviderPropsStoreExternalProps } from "embedding-sdk-bundle/components/public/ComponentProvider";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";

type MockSdkStore = {
  getState: () => undefined;
  subscribe: (listener: () => void) => () => void;
};

const MOCK_SDK_STORE: MockSdkStore = {
  getState: () => undefined,
  subscribe: () => () => undefined,
};

let mountedProviderCount = 0;

function getPropsStore() {
  return ensureMetabaseProviderPropsStore<
    MetabaseProviderPropsStoreExternalProps,
    MockSdkStore
  >();
}

export function installMockSdk(bundle: MetabaseEmbeddingSdkBundleExports) {
  const win = getWindow();

  if (!win) {
    return bundle;
  }

  win.METABASE_EMBEDDING_SDK_BUNDLE = bundle;

  const propsStore = getPropsStore();
  propsStore.setProps({});
  propsStore.updateInternalProps({
    reduxStore: MOCK_SDK_STORE,
    loadingState: SdkLoadingState.Initialized,
    loadingError: null,
  });

  return bundle;
}

function uninstallMockSdk() {
  const win = getWindow();

  if (!win || mountedProviderCount > 0) {
    return;
  }

  delete win.METABASE_EMBEDDING_SDK_BUNDLE;
  getPropsStore().cleanup();
}

export function acquireMockSdk(bundle: MetabaseEmbeddingSdkBundleExports) {
  mountedProviderCount += 1;
  installMockSdk(bundle);

  return () => {
    mountedProviderCount -= 1;
    uninstallMockSdk();
  };
}
