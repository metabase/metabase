import { useEffect, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { store, useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import {
  getOrRefreshSession,
  setLoginStatus,
} from "embedding-sdk/store/reducer";
import {
  getLoginStatus,
  getSessionTokenState,
} from "embedding-sdk/store/selectors";
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

const getErrorMessage = (authType: SDKConfigType["authType"]) => {
  if (authType === "jwt") {
    return t`Could not authenticate: invalid JWT token`;
  }

  if (authType === "apiKey") {
    return t`Could not authenticate: invalid API key`;
  }

  return t`Invalid auth type`;
};

export const useInitData = ({ config }: InitDataLoaderParameters) => {
  const dispatch = useSdkDispatch();

  const loginStatus = useSdkSelector(getLoginStatus);

  const [sessionTokenState, setSessionTokenState] =
    useState<EmbeddingSessionTokenState | null>(null);

  useEffect(() => {
    registerVisualizationsOnce();
    dispatch(setLoginStatus({ status: "uninitialized" }));
  }, [dispatch]);

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

    if (config.authType === "jwt" && config.jwtProviderUri) {
      api.onBeforeRequest = () =>
        dispatch(getOrRefreshSession(config.jwtProviderUri));
      api.sessionToken = sessionTokenState?.token?.id;
      dispatch(setLoginStatus({ status: "initialized" }));
    } else if (config.authType === "apiKey" && config.apiKey) {
      api.apiKey = config.apiKey;
      dispatch(setLoginStatus({ status: "initialized" }));
    } else {
      dispatch(
        setLoginStatus({
          status: "error",
          error: new Error(getErrorMessage(config.authType)),
        }),
      );
    }
  }, [config, dispatch, sessionTokenState]);

  useEffect(() => {
    const fetchData = async () => {
      if (loginStatus.status === "initialized") {
        dispatch(setLoginStatus({ status: "loading" }));

        try {
          const [userResponse, [_, siteSettingsResponse]] = await Promise.all([
            dispatch(refreshCurrentUser()),
            dispatch(reloadSettings()),
          ]);

          if (
            userResponse.meta.requestStatus === "rejected" ||
            siteSettingsResponse.meta.requestStatus === "rejected"
          ) {
            dispatch(
              setLoginStatus({
                status: "error",
                error: new Error(getErrorMessage(config.authType)),
              }),
            );
            return;
          }

          dispatch(setLoginStatus({ status: "success" }));
        } catch (error) {
          dispatch(
            setLoginStatus({
              status: "error",
              error: new Error(getErrorMessage(config.authType)),
            }),
          );
        }
      }
    };

    fetchData();
  }, [config.authType, dispatch, loginStatus.status]);
};
