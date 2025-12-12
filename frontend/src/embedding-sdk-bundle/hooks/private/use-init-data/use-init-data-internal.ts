import { useEffect } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { initAuth } from "embedding-sdk-bundle/store/auth";
import { initGuestEmbed } from "embedding-sdk-bundle/store/guest-embed";
import {
  setFetchRefreshTokenFn,
  setMetabaseClientUrl,
  setMetabaseInstanceVersion,
} from "embedding-sdk-bundle/store/reducer";
import { getFetchRefreshTokenFn } from "embedding-sdk-bundle/store/selectors";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types";
import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import api from "metabase/lib/api";
import registerVisualizations from "metabase/visualizations/register";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  reduxStore: SdkStore;
  isGuestEmbed?: boolean;
  authConfig: MetabaseAuthConfig;
  isLocalHost?: boolean;
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

  const isGuestEmbed = !!props.authConfig.isGuest;

  useInitDataInternal({
    reduxStore,
    isGuestEmbed,
    authConfig,
  });
};

export const useInitDataInternal = ({
  reduxStore,
  isGuestEmbed,
  authConfig,
  isLocalHost,
}: InitDataLoaderParameters) => {
  const dispatch = reduxStore.dispatch;

  const isDataUninitialized = () =>
    reduxStore.getState().sdk.initStatus.status === "uninitialized";

  const fetchRefreshTokenFnFromStore = useLazySelector(getFetchRefreshTokenFn);

  const sdkPackageVersion =
    getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO").version ?? null;

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
    if (!isDataUninitialized()) {
      return;
    }

    if (isGuestEmbed) {
      dispatch(initGuestEmbed());
    } else {
      dispatch(initAuth({ ...authConfig, isLocalHost }));
    }
  });

  useMount(function registerVisualizations() {
    registerVisualizationsOnce();
  });
};
