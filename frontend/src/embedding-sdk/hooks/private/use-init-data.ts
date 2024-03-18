import { useEffect, useState } from "react";

import { reloadSettings } from "metabase/admin/settings/settings";
import api from "metabase/lib/api";
import { refreshCurrentUser } from "metabase/redux/user";
import registerVisualizations from "metabase/visualizations/register";

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

  useEffect(() => {
    registerVisualizations();
  }, []);

  useEffect(() => {
    api.basename = config.metabaseInstanceUrl;

    if (config.authType === "apiKey" && config.apiKey) {
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
  }, [config, store, store.dispatch]);

  return {
    isLoggedIn,
    isInitialized,
  };
};
