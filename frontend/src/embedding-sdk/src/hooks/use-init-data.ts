import { useEffect, useState } from "react";
import type { useDispatch } from "metabase/lib/redux";
import registerVisualizations from "metabase/visualizations/register";
import api from "metabase/lib/api";
import { refreshCurrentUser } from "metabase/redux/user";
import { reloadSettings } from "metabase/admin/settings/settings";
import { getSessionToken } from "metabase/public/reducers";
import type { SDKConfigType } from "../config";

type InitDataLoaderProps = {
  apiUrl: SDKConfigType["metabaseInstanceUrl"];
  dispatch: ReturnType<typeof useDispatch>;
  store: any;
};

export const useInitData = ({
  apiUrl,
  dispatch,
  store,
}: InitDataLoaderProps): {
  isLoggedIn: boolean;
  isInitialized: boolean;
} => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [sessionToken, setSessionToken] = useState<string | null>();

  useEffect(() => {
    const updateToken = () => {
      // Access the state using store.getState() and update local state
      const currentState = store.getState();
      setSessionToken(getSessionToken(currentState)); // Assuming the token is stored directly in the state's root
    };

    // Subscribe to store updates
    const unsubscribe = store.subscribe(updateToken);

    // Initial update
    updateToken();

    // Cleanup subscription on component unmount
    return () => unsubscribe();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    registerVisualizations();
  }, []);

  useEffect(() => {
    if (sessionToken && apiUrl) {
      api.basename = apiUrl;
      api.sessionToken = sessionToken;

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
  }, [apiUrl, dispatch, sessionToken]);

  return {
    isLoggedIn,
    isInitialized,
  };
};
