import { useEffect, useState } from "react";
import _ from "underscore";

import { store } from "embedding-sdk/store";
import {
  getOrRefreshSession,
  getSessionTokenState,
} from "embedding-sdk/store/reducer";
import type { EmbeddingSessionTokenState } from "embedding-sdk/store/types";
import type { SDKConfigType } from "embedding-sdk/types";
import { reloadSettings } from "metabase/admin/settings/settings";
import api from "metabase/lib/api";
import { useDispatch } from "metabase/lib/redux";
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
  const dispatch = useDispatch();

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionTokenState, setSessionTokenState] =
    useState<EmbeddingSessionTokenState | null>(null);

  useEffect(() => {
    registerVisualizationsOnce();
  }, []);

  const jwtProviderUri =
    config.authType === "jwt" ? config.jwtProviderUri : null;
  useEffect(() => {
    if (config.authType === "jwt") {
      const updateToken = () => {
        const currentState = store.getState();
        setSessionTokenState(getSessionTokenState(currentState));
      };

      const unsubscribe = store.subscribe(updateToken);

      if (jwtProviderUri) {
        dispatch(getOrRefreshSession(jwtProviderUri));
      }

      updateToken();

      return () => unsubscribe();
    }
  }, [config.authType, dispatch, jwtProviderUri]);

  useEffect(() => {
    api.basename = config.metabaseInstanceUrl;

    if (config.authType === "jwt") {
      api.onBeforeRequest = () =>
        dispatch(getOrRefreshSession(config.jwtProviderUri));
      api.sessionToken = sessionTokenState?.token?.id;
    } else if (config.authType === "apiKey" && config.apiKey) {
      api.apiKey = config.apiKey;
    } else {
      setIsLoggedIn(false);
      return;
    }

    Promise.all([
      dispatch(refreshCurrentUser()),
      dispatch(reloadSettings()),
    ]).then(() => {
      setIsInitialized(true);
      setIsLoggedIn(true);
    });
  }, [config, dispatch, sessionTokenState]);

  return {
    isLoggedIn,
    isInitialized,
  };
};
