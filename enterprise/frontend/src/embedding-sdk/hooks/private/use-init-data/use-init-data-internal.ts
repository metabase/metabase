import { useEffect } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { getEmbeddingSdkPackageBuildData } from "embedding-sdk/lib/get-embedding-sdk-package-build-data";
import { useLazySelector } from "embedding-sdk/sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store";
import { initAuth } from "embedding-sdk/store/auth";
import {
  setFetchRefreshTokenFn,
  setMetabaseClientUrl,
  setMetabaseInstanceVersion,
} from "embedding-sdk/store/reducer";
import { getFetchRefreshTokenFn } from "embedding-sdk/store/selectors";
import type { SdkStore } from "embedding-sdk/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk/types";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import api from "metabase/lib/api";
import registerVisualizations from "metabase/visualizations/register";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  reduxStore: SdkStore;
  authConfig: MetabaseAuthConfig;
}

export const useInitData = () => {
  const {
    state: { props, internalProps },
  } = useMetabaseProviderPropsStore();

  const reduxStore = internalProps.reduxStore;
  const authConfig = props?.authConfig;

  if (!reduxStore || !authConfig) {
    throw new Error(
      "`useInitData` hook has missing values for some required parameters",
    );
  }

  useInitDataInternal({
    reduxStore,
    authConfig,
  });
};

export const useInitDataInternal = ({
  reduxStore,
  authConfig,
}: InitDataLoaderParameters) => {
  const dispatch = reduxStore.dispatch;

  const isAuthUninitialized = () =>
    reduxStore.getState().sdk.loginStatus.status === "uninitialized";

  const fetchRefreshTokenFnFromStore = useLazySelector(getFetchRefreshTokenFn);
  const sdkPackageVersion = getEmbeddingSdkPackageBuildData().version ?? null;

  // We have to initialize the API fields before other possible API calls
  if (api.basename !== authConfig.metabaseInstanceUrl) {
    api.basename = authConfig.metabaseInstanceUrl;
  }

  if (!api.requestClient) {
    api.requestClient = {
      name: EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      version: sdkPackageVersion,
    };
  }

  if (!api.onResponseError) {
    api.onResponseError = ({
      metabaseVersion,
    }: {
      metabaseVersion: string;
    }) => {
      // Use ensureMetabaseProviderPropsStore to access the current instance of reduxStore
      ensureMetabaseProviderPropsStore()
        .getState()
        .internalProps.reduxStore?.dispatch(
          setMetabaseInstanceVersion(metabaseVersion),
        );
    };
  }

  useEffect(() => {
    dispatch(setMetabaseClientUrl(authConfig.metabaseInstanceUrl));
  }, [dispatch, authConfig.metabaseInstanceUrl]);

  useEffect(() => {
    if (authConfig.fetchRequestToken !== fetchRefreshTokenFnFromStore) {
      dispatch(setFetchRefreshTokenFn(authConfig.fetchRequestToken ?? null));
    }
  }, [authConfig.fetchRequestToken, fetchRefreshTokenFnFromStore, dispatch]);

  useMount(function initializeData() {
    if (isAuthUninitialized()) {
      dispatch(initAuth(authConfig));
    }
  });

  useMount(function registerVisualizations() {
    registerVisualizationsOnce();
  });
};
