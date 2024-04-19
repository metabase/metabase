import { useEffect, useState } from "react";
import _ from "underscore";

import { store, useSdkDispatch } from "embedding-sdk/store";
import {
  getOrRefreshSession,
  setLoginStatus,
} from "embedding-sdk/store/reducer";
import { getSessionTokenState } from "embedding-sdk/store/selectors";
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

export const useInitData = ({ config }: InitDataLoaderParameters) => {
  const dispatch = useSdkDispatch();

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
      dispatch(
        setLoginStatus({
          status: "error",
          error: new Error("Invalid auth type"),
        }),
      );
      return;
    }

    Promise.all([dispatch(refreshCurrentUser()), dispatch(reloadSettings())])
      .then(([userData]) => {
        if (userData.meta.requestStatus === "rejected") {
          dispatch(
            setLoginStatus({
              status: "error",
              error: new Error("Failed to refresh current user"),
            }),
          );
          return;
        }
        dispatch(setLoginStatus({ status: "success" }));
      })
      .catch(() => {
        dispatch(
          setLoginStatus({
            status: "error",
            error: new Error("Failed to refresh current user"),
          }),
        );
      });
  }, [config, dispatch, sessionTokenState]);
};
