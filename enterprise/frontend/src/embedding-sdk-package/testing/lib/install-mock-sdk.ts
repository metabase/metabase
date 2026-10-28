import type { MetabaseProviderPropsStoreExternalProps } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";

import { MOCK_SDK_BUNDLE } from "./mock-sdk-bundle";
import { resetMockSdkRegistry } from "./mock-sdk-registry";

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

export function installMockSdk() {
  const win = getWindow();

  if (!win) {
    return;
  }

  win.METABASE_EMBEDDING_SDK_BUNDLE = MOCK_SDK_BUNDLE;

  const propsStore = getPropsStore();
  propsStore.setProps({});
  propsStore.updateInternalProps({
    reduxStore: MOCK_SDK_STORE,
    loadingState: SdkLoadingState.Initialized,
    loadingError: null,
  });
}

let mountedProviderCount = 0;

function uninstallMockSdk() {
  const win = getWindow();

  if (!win || mountedProviderCount > 0) {
    return;
  }

  delete win.METABASE_EMBEDDING_SDK_BUNDLE;
  resetMockSdkRegistry();
  getPropsStore().cleanup();
}

export function acquireMockSdk() {
  mountedProviderCount += 1;
  installMockSdk();

  return () => {
    mountedProviderCount -= 1;
    queueMicrotask(uninstallMockSdk);
  };
}
