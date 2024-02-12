import { useEffect, useState } from "react";
import type { useDispatch } from "metabase/lib/redux";
import registerVisualizations from "metabase/visualizations/register";
import api from "metabase/lib/api";
import { refreshCurrentUser } from "metabase/redux/user";
import { reloadSettings } from "metabase/admin/settings/settings";
import type { SDKConfigType } from "../config";

type InitDataLoaderProps = {
  apiUrl: SDKConfigType["metabaseInstanceUrl"];
  dispatch: ReturnType<typeof useDispatch>;
  sessionToken: string | null | undefined
};

export const useInitData = ({
  apiUrl,
  sessionToken,
  dispatch,
}: InitDataLoaderProps): {
  isLoggedIn: boolean;
  isInitialized: boolean;
} => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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
