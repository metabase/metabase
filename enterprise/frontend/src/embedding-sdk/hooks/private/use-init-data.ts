import { useEffect } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import { useSdkDispatch } from "embedding-sdk/store";
import { setFetchRefreshTokenFn } from "embedding-sdk/store/reducer";
import type { SDKConfig } from "embedding-sdk/types";
import api from "metabase/lib/api";
import registerVisualizations from "metabase/visualizations/register";

import { setupSdkAuth } from "./setup-sdk-auth";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  config: SDKConfig;
}

export const useInitData = ({ config }: InitDataLoaderParameters) => {
  const { allowConsoleLog = true } = config;

  // This is outside of a useEffect otherwise calls done on the first render could use the wrong value
  // This is the case for example for the locale json files
  if (api.basename !== config.metabaseInstanceUrl) {
    api.basename = config.metabaseInstanceUrl;
  }

  const dispatch = useSdkDispatch();

  useEffect(() => {
    registerVisualizationsOnce();

    const EMBEDDING_SDK_VERSION = getEmbeddingSdkVersion();
    api.requestClient = {
      name: "embedding-sdk-react",
      version: EMBEDDING_SDK_VERSION,
    };

    if (allowConsoleLog) {
      // eslint-disable-next-line no-console
      console.log(
        // eslint-disable-next-line no-literal-metabase-strings -- Not a user facing string
        `Using Metabase Embedding SDK, version ${EMBEDDING_SDK_VERSION}`,
      );
    }
  }, [allowConsoleLog]);

  useEffect(() => {
    dispatch(setFetchRefreshTokenFn(config.fetchRequestToken ?? null));
  }, [dispatch, config.fetchRequestToken]);

  // init auth
  useMount(() => {
    setupSdkAuth(config, dispatch);
  });
};
