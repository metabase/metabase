import { useEffect, useRef } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import { isSdkVersionCompatibleWithMetabaseVersion } from "embedding-sdk/lib/version-utils";
import { useLazySelector } from "embedding-sdk/sdk-package/hooks/private/use-lazy-selector";
import { initAuth } from "embedding-sdk/store/auth";
import {
  setFetchRefreshTokenFn,
  setMetabaseClientUrl,
  setMetabaseInstanceVersion,
} from "embedding-sdk/store/reducer";
import {
  getFetchRefreshTokenFn,
  getMetabaseInstanceVersion,
} from "embedding-sdk/store/selectors";
import type { SdkStore } from "embedding-sdk/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk/types";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import api from "metabase/lib/api";
import registerVisualizations from "metabase/visualizations/register";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  reduxStore: SdkStore;
  authConfig: MetabaseAuthConfig;
  allowConsoleLog?: boolean;
}

export const useInitData = ({
  reduxStore,
  authConfig,
  allowConsoleLog = true,
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

    const mbVersion = getMetabaseInstanceVersion(reduxStore.getState());
    const sdkVersion = getEmbeddingSdkVersion();

    if (
      mbVersion &&
      sdkVersion !== "unknown" &&
      !isSdkVersionCompatibleWithMetabaseVersion({ mbVersion, sdkVersion })
    ) {
      console.warn(
        `SDK version ${sdkVersion} is not compatible with MB version ${mbVersion}, this might cause issues.`,
        // eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins.
        "Learn more at https://www.metabase.com/docs/latest/embedding/sdk/version",
      );
    }

    api.requestClient = {
      name: EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      version: sdkVersion,
    };

    api.onResponseError = ({
      metabaseVersion,
    }: {
      metabaseVersion: string;
    }) => {
      dispatch(setMetabaseInstanceVersion(metabaseVersion));
    };

    if (allowConsoleLog) {
      // eslint-disable-next-line no-console
      console.log(
        // eslint-disable-next-line no-literal-metabase-strings -- Not a user facing string
        `Using Metabase Embedding SDK, version ${sdkVersion}`,
      );
    }
  });
};
