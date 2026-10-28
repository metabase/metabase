import type { MetabaseProviderPropsStoreExternalProps } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";

import { MOCK_SDK_BUNDLE } from "./mock-sdk-bundle";

type MockSdkStore = {
  getState: () => undefined;
  subscribe: (listener: () => void) => () => void;
};

const MOCK_SDK_STORE: MockSdkStore = {
  getState: () => undefined,
  subscribe: () => () => undefined,
};

const getPropsStore = () =>
  ensureMetabaseProviderPropsStore<
    MetabaseProviderPropsStoreExternalProps,
    MockSdkStore
  >();

export const installMockSdk = () => {
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
};

export const uninstallMockSdk = () => {
  const win = getWindow();

  if (!win) {
    return;
  }

  delete win.METABASE_EMBEDDING_SDK_BUNDLE;
  getPropsStore().cleanup();
};
