import { useEffect, useState } from "react";
import registerVisualizations from "metabase/visualizations/register";
import api from "metabase/lib/api";
import { refreshCurrentUser } from "metabase/redux/user";
import { reloadSettings } from "metabase/admin/settings/settings";
import { getOrRefreshSession, getSessionToken } from "metabase/public/reducers";
import type { PublicTokenState } from "metabase-types/store";
import type { SDKConfigType } from "../../config";

type InitDataLoaderProps = {
  store: any;
  config: SDKConfigType;
};

export const useInitData = ({
  store,
  config,
}: InitDataLoaderProps): {
  isLoggedIn: boolean;
  isInitialized: boolean;
} => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [sessionToken, setSessionToken] = useState<PublicTokenState>(null);

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
    registerVisualizations();
  }, []);

  useEffect(() => {
    api.basename = config.metabaseInstanceUrl;

    if (config.authType === "jwt" && sessionToken?.token?.id) {
      api.onBeforeRequest = () =>
        store.dispatch(getOrRefreshSession(config.jwtProviderUri));
      api.sessionToken = sessionToken.token.id;
    } else if (config.authType === "apiKey" && config.apiKey) {
      api.apiKey = config.apiKey;
    } else {
      setIsLoggedIn(false);
      return;
    }

    Promise.all([
      store.dispatch(refreshCurrentUser()),
      store.dispatch(reloadSettings()),
    ]).then(() => {
      setIsInitialized(true);
      setIsLoggedIn(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, store.dispatch, sessionToken]);

  return {
    isLoggedIn,
    isInitialized,
  };
};
