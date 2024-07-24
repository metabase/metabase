import { useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { EmbeddingSessionToken } from "embedding-sdk";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import {
  getOrRefreshSession,
  setEnvironmentType,
  setFetchRefreshTokenFn,
  setLoginStatus,
} from "embedding-sdk/store/reducer";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import type { SdkDispatch } from "embedding-sdk/store/types";
import type { SDKConfig, SDKConfigWithJWT } from "embedding-sdk/types";
import api from "metabase/lib/api";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import registerVisualizations from "metabase/visualizations/register";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  config: SDKConfig;
}

const setupJwtAuth = (config: SDKConfigWithJWT, dispatch: SdkDispatch) => {
  api.onBeforeRequest = async () => {
    const tokenState = await dispatch(
      getOrRefreshSession(config.jwtProviderUri),
    );

    api.sessionToken = (tokenState.payload as EmbeddingSessionToken | null)?.id;
  };
};

export const useInitData = ({ config }: InitDataLoaderParameters) => {
  const dispatch = useSdkDispatch();

  const loginStatus = useSdkSelector(getLoginStatus);

  useEffect(() => {
    registerVisualizationsOnce();
  }, [dispatch]);

  useEffect(() => {
    dispatch(setFetchRefreshTokenFn(config.fetchRequestToken ?? null));
  }, [dispatch, config.fetchRequestToken]);

  useEffect(() => {
    if (loginStatus.status === "uninitialized") {
      dispatch(setEnvironmentType("prod"));
      api.basename = config.metabaseInstanceUrl;

      if (config.apiKey && window.location.hostname === "localhost") {
        api.apiKey = config.apiKey;
        console.warn("You are using API Keys!! OOOH SO SCARY");
        dispatch(setEnvironmentType("dev"));
        dispatch(setLoginStatus({ status: "validated" }));
      } else if (config.jwtProviderUri) {
        setupJwtAuth(config, dispatch);
        dispatch(setLoginStatus({ status: "validated" }));
      } else {
        let authErrorMessage: string;
        if (config.jwtProviderUri) {
          authErrorMessage = t`Invalid JWT URI provided`;
        } else {
          authErrorMessage = config.apiKey
            ? t`Can't use API Keys in production`
            : t`Invalid API Key`;
        }

        dispatch(
          setLoginStatus({
            status: "error",
            error: new Error(authErrorMessage),
          }),
        );
      }
    }
  }, [config, dispatch, loginStatus.status]);

  useEffect(() => {
    if (loginStatus.status === "validated") {
      const fetchData = async () => {
        dispatch(setLoginStatus({ status: "loading" }));

        try {
          const [userResponse, siteSettingsResponse] = await Promise.all([
            dispatch(refreshCurrentUser()),
            dispatch(refreshSiteSettings({})),
          ]);

          if (
            userResponse.meta.requestStatus === "rejected" ||
            siteSettingsResponse.meta.requestStatus === "rejected"
          ) {
            dispatch(
              setLoginStatus({
                status: "error",
                error: new Error(
                  t`Could not authenticate: invalid JWT URI or JWT provider did not return a valid JWT token`,
                ),
              }),
            );
            return;
          }

          dispatch(setLoginStatus({ status: "success" }));
        } catch (error) {
          dispatch(
            setLoginStatus({
              status: "error",
              error: new Error(
                t`Could not authenticate: invalid JWT URI or JWT provider did not return a valid JWT token`,
              ),
            }),
          );
        }
      };

      fetchData();
    }
  }, [dispatch, loginStatus.status]);
};
