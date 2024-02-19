import { useEffect, useState } from "react";
import type { useDispatch } from "metabase/lib/redux";
import registerVisualizations from "metabase/visualizations/register";
import api from "metabase/lib/api";
import { refreshCurrentUser } from "metabase/redux/user";
import { reloadSettings } from "metabase/admin/settings/settings";
import { getOrRefreshSession, getSessionToken } from "metabase/public/reducers";
import type { PublicTokenState } from "metabase-types/store";
import type { SDKConfigType } from "../config";

type InitDataLoaderProps = {
  apiUrl: SDKConfigType["metabaseInstanceUrl"];
  dispatch: ReturnType<typeof useDispatch>;
  store: any;
  jwtUri: SDKConfigType["jwtProviderUri"];
  apiKey?: string;
};

export const useInitData = ({
  apiUrl,
  dispatch,
  store,
  jwtUri,
  apiKey,
}: InitDataLoaderProps): {
  isLoggedIn: boolean;
  isInitialized: boolean;
} => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [sessionToken, setSessionToken] = useState<PublicTokenState>(null);

  useEffect(() => {
    const updateToken = () => {
      const currentState = store.getState();
      setSessionToken(getSessionToken(currentState));
    };

    const unsubscribe = store.subscribe(updateToken);

    if (jwtUri) {
      dispatch(getOrRefreshSession(jwtUri));
    }

    updateToken();

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    registerVisualizations();
  }, []);

  useEffect(() => {
    if (jwtUri) {
      api.onBeforeRequest = () => dispatch(getOrRefreshSession(jwtUri));
    }

    if (apiUrl) {
      api.basename = apiUrl;
    }

    if (sessionToken?.token?.id) {
      api.sessionToken = sessionToken.token?.id;
    } else if (apiKey) {
      api.apiKey = apiKey;
    }

    if ((sessionToken?.token?.id || apiKey) && apiUrl) {
      Promise.all([
        dispatch(refreshCurrentUser()),
        dispatch(reloadSettings()),
      ]).then(() => {
        setIsInitialized(true);
        setIsLoggedIn(true);
      });
    } else {
      setIsLoggedIn(false);
    }
  }, [apiKey, apiUrl, dispatch, jwtUri, sessionToken]);

  return {
    isLoggedIn,
    isInitialized,
  };
};
