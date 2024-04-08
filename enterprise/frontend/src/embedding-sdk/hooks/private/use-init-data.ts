import type { Store } from "@reduxjs/toolkit";
import { useEffect, useState } from "react";
import _ from "underscore";

import { getOrRefreshSession, getSessionTokenState } from "embedding-sdk/store/reducer";
import type {
  SDKConfigType,
} from "embedding-sdk/types";
import { reloadSettings } from "metabase/admin/settings/settings";
import api from "metabase/lib/api";
import { useDispatch } from "metabase/lib/redux";
import { refreshCurrentUser } from "metabase/redux/user";
import registerVisualizations from "metabase/visualizations/register";
import type {AppStore, EmbeddingSessionTokenState} from "embedding-sdk/store/types";


const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  store: AppStore;
  config: SDKConfigType;
}

export const useInitData = ({
  store,
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

  useEffect(() => {
    if (config.authType === "jwt") {
      const updateToken = () => {
        const currentState = store.getState();
        setSessionTokenState(getSessionTokenState(currentState));
      };

      const unsubscribe = store.subscribe(updateToken);

      if (config.jwtProviderUri) {
        store.dispatch(getOrRefreshSession(config.jwtProviderUri));
      }

      updateToken();

      return () => unsubscribe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.basename = config.metabaseInstanceUrl;

    if (config.authType === "jwt") {
      api.onBeforeRequest = () =>
        store.dispatch(getOrRefreshSession(config.jwtProviderUri));
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
  }, [config, dispatch, sessionTokenState, store]);

  return {
    isLoggedIn,
    isInitialized,
  };
};
