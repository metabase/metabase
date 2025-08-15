import { useEffect, useRef } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { getEmbeddingSdkPackageVersion } from "embedding-sdk/lib/get-embedding-sdk-package-version";
import { useLazySelector } from "embedding-sdk/sdk-shared/hooks/use-lazy-selector";
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

export const useInitData = ({
  reduxStore,
  authConfig,
}: InitDataLoaderParameters) => {
  // react calls some lifecycle hooks twice in dev mode, the auth init fires some http requests and when it's called twice,
  // it fires them twice as well, making debugging harder as they show up twice in the network tab and in the logs
  const hasBeenInitialized = useRef(false);

  const dispatch = reduxStore.dispatch;

  const fetchRefreshTokenFnFromStore = useLazySelector(getFetchRefreshTokenFn);

  // This is outside of a useEffect otherwise calls done on the first render could use the wrong value
  // This is the case for example for the locale json files
  if (api.basename !== authConfig.metabaseInstanceUrl) {
    api.basename = authConfig.metabaseInstanceUrl;
  }

  useEffect(() => {
    dispatch(setMetabaseClientUrl(authConfig.metabaseInstanceUrl));
  }, [dispatch, authConfig.metabaseInstanceUrl]);

  useEffect(() => {
    if (authConfig.fetchRequestToken !== fetchRefreshTokenFnFromStore) {
      // This needs to be a useEffect to avoid the `Cannot update a component XX while rendering a different component` error
      dispatch(setFetchRefreshTokenFn(authConfig.fetchRequestToken ?? null));
    }
  }, [authConfig.fetchRequestToken, fetchRefreshTokenFnFromStore, dispatch]);

  useMount(() => {
    if (hasBeenInitialized.current) {
      return;
    }

    registerVisualizationsOnce();

    const isAuthUninitialized =
      reduxStore.getState().sdk.loginStatus.status === "uninitialized";

    if (!isAuthUninitialized) {
      return;
    }

    hasBeenInitialized.current = true;

    dispatch(initAuth(authConfig));

    const sdkPackageVersion = getEmbeddingSdkPackageVersion();

    api.requestClient = {
      name: EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      version: sdkPackageVersion,
    };

    api.onResponseError = ({
      metabaseVersion,
    }: {
      metabaseVersion: string;
    }) => {
      dispatch(setMetabaseInstanceVersion(metabaseVersion));
    };
  });
};
