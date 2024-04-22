import { useEffect } from "react";
import _ from "underscore";

import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import {
  getOrRefreshSession,
  setIsInitialized,
  setIsLoggedIn,
} from "embedding-sdk/store/reducer";
import { getIsInitialized, getIsLoggedIn } from "embedding-sdk/store/selectors";
import type { EmbeddingSessionTokenState } from "embedding-sdk/store/types";
import type { SDKConfigType } from "embedding-sdk/types";
import { reloadSettings } from "metabase/admin/settings/settings";
import api from "metabase/lib/api";
import { refreshCurrentUser } from "metabase/redux/user";
import registerVisualizations from "metabase/visualizations/register";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  config: SDKConfigType;
}

export const useInitData = ({
  config,
}: InitDataLoaderParameters): {
  isLoggedIn: boolean;
  isInitialized: boolean;
} => {
  const dispatch = useSdkDispatch();

  const isInitialized = useSdkSelector(getIsInitialized);
  const isLoggedIn = useSdkSelector(getIsLoggedIn);

  useEffect(() => {
    registerVisualizationsOnce();
  }, []);

  useEffect(() => {
    api.basename = config.metabaseInstanceUrl;

    if (config.authType === "jwt") {
      api.onBeforeRequest = async () => {
        const tokenState = await dispatch(
          getOrRefreshSession(config.jwtProviderUri),
        );

        api.sessionToken = (
          tokenState.payload as EmbeddingSessionTokenState["token"]
        )?.id;
      };
    } else if (config.authType === "apiKey" && config.apiKey) {
      api.apiKey = config.apiKey;
    } else {
      dispatch(setIsLoggedIn(false));
      return;
    }

    Promise.all([
      dispatch(refreshCurrentUser()),
      dispatch(reloadSettings()),
    ]).then(() => {
      dispatch(setIsInitialized(true));
      dispatch(setIsLoggedIn(true));
    });
  }, [config, dispatch]);

  return {
    isLoggedIn,
    isInitialized,
  };
};
