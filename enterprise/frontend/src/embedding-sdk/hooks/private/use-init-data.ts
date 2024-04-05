import { useEffect, useState } from "react";
import _ from "underscore";

import { reloadSettings } from "metabase/admin/settings/settings";
import api from "metabase/lib/api";
import { useDispatch } from "metabase/lib/redux";
import { refreshCurrentUser } from "metabase/redux/user";
import registerVisualizations from "metabase/visualizations/register";

import { getOrRefreshSession, getSessionToken } from "../../reducer";
import type { EmbeddingSessionTokenState, SDKConfigType } from "../../types";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  store: any;
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
  const [sessionToken, setSessionToken] =
    useState<EmbeddingSessionTokenState | null>(null);

  useEffect(() => {
    registerVisualizationsOnce();
  }, []);

  useEffect(() => {
    if (config.authType === "jwt") {
      const updateToken = () => {
        const currentState = store.getState();
        setSessionToken(getSessionToken(currentState));
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
      api.sessionToken = sessionToken?.token?.id;
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
  }, [config, dispatch, sessionToken?.token?.id, store]);

  return {
    isLoggedIn,
    isInitialized,
  };
};
