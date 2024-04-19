import { useEffect, useState } from "react";
import _ from "underscore";

import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import {
  getOrRefreshSession,
  setIsInitialized,
  setIsLoggedIn,
} from "embedding-sdk/store/reducer";
import {
  getIsInitialized,
  getIsLoggedIn,

} from "embedding-sdk/store/selectors";
import type { SDKConfigType, LoginStatus } from "embedding-sdk/types";
import { reloadSettings } from "metabase/admin/settings/settings";
import api from "metabase/lib/api";
import { refreshCurrentUser } from "metabase/redux/user";
import registerVisualizations from "metabase/visualizations/register";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  config: SDKConfigType;
}

const getErrorMessage = (authType: SDKConfigType["authType"]) => {
  if (authType === "jwt") {
    return "JWT token is invalid";
  }

  if (authType === "apiKey") {
    return "Invalid API key";
  }
};

export const useInitData = ({
  config,
}: InitDataLoaderParameters): {
  isLoggedIn: boolean;
  loginStatus: LoginStatus;
  isInitialized: boolean;
} => {
  const dispatch = useSdkDispatch();

  const isInitialized = useSdkSelector(getIsInitialized);
  const isLoggedIn = useSdkSelector(getIsLoggedIn);

  const [loginStatus, setLoginStatus] = useState<LoginStatus>(null);

  useEffect(() => {
    registerVisualizationsOnce();

    setLoginStatus({ status: "loading" });
  }, []);

  useEffect(() => {
    api.basename = config.metabaseInstanceUrl;

    if (config.authType === "jwt" && config.jwtProviderUri) {
      api.onBeforeRequest = async () => {
        const response = await dispatch(
          getOrRefreshSession(config.jwtProviderUri),
        ).unwrap();
        api.sessionToken = response?.id;
      };
    } else if (config.authType === "apiKey" && config.apiKey) {
      api.apiKey = config.apiKey;
    } else {
      dispatch(setIsLoggedIn(false));
      setLoginStatus({
        error: new Error("Invalid auth type"),
        status: "error",
      });
    }
  }, [
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    config.apiKey,
    config.authType,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    config.jwtProviderUri,
    config.metabaseInstanceUrl,
    dispatch,
  ]);

  useEffect(() => {
    if (loginStatus?.status !== "error") {
      Promise.all([dispatch(refreshCurrentUser()), dispatch(reloadSettings())])
        .then(([currentUser]) => {
          if (currentUser.meta.requestStatus === "rejected") {
            dispatch(setIsLoggedIn(false));
            setLoginStatus({
              error: new Error(
                `Couldn't fetch current user: ${getErrorMessage(
                  config.authType,
                )}`,
              ),
              status: "error",
            });
            return;
          }
          dispatch(setIsInitialized(true));
          dispatch(setIsLoggedIn(true));
          setLoginStatus({ status: "success" });
        })
        .catch(() => {
          setLoginStatus({
            status: "error",
            error: new Error(
              `Error when authenticating: ${getErrorMessage(config.authType)}`,
            ),
          });
          dispatch(setIsInitialized(false));
          dispatch(setIsLoggedIn(false));
        });
    }
  }, [
    loginStatus?.status,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    config.apiKey,
    config.authType,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    config.jwtProviderUri,
    config.metabaseInstanceUrl,
    dispatch,
  ]);

  return {
    isLoggedIn,
    isInitialized,
    loginStatus,
  };
};
