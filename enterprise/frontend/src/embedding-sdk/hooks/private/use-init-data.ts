import { useEffect } from "react";
import { match, P } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import type { EmbeddingSessionToken } from "embedding-sdk";
import { presentApiKeyUsageWarning } from "embedding-sdk";
import { getErrorMessage } from "embedding-sdk/lib/user-warnings/constants";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import {
  getOrRefreshSession,
  setFetchRefreshTokenFn,
  setLoginStatus,
} from "embedding-sdk/store/reducer";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import type { SdkDispatch } from "embedding-sdk/store/types";
import type {
  SDKConfig,
  SDKConfigWithApiKey,
  SDKConfigWithJWT,
} from "embedding-sdk/types";
import api from "metabase/lib/api";
import { useSelector } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import { getApplicationName } from "metabase/selectors/whitelabel";
import registerVisualizations from "metabase/visualizations/register";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  config: SDKConfig;
}

const setupJwtAuth = (
  jwtProviderUri: SDKConfigWithJWT["jwtProviderUri"],
  dispatch: SdkDispatch,
) => {
  api.onBeforeRequest = async () => {
    const tokenState = await dispatch(getOrRefreshSession(jwtProviderUri));

    api.sessionToken = (tokenState.payload as EmbeddingSessionToken | null)?.id;
  };

  dispatch(setLoginStatus({ status: "validated" }));
};

const setupLocalApiKey = (
  dispatch: SdkDispatch,
  apiKey: SDKConfigWithApiKey["apiKey"],
) => {
  api.apiKey = apiKey;
  dispatch(setLoginStatus({ status: "validated" }));
};

export const useInitData = ({ config }: InitDataLoaderParameters) => {
  const dispatch = useSdkDispatch();

  const loginStatus = useSdkSelector(getLoginStatus);
  const appName = useSelector(getApplicationName);

  useEffect(() => {
    registerVisualizationsOnce();
  }, [dispatch]);

  useEffect(() => {
    dispatch(setFetchRefreshTokenFn(config.fetchRequestToken ?? null));
  }, [dispatch, config.fetchRequestToken]);

  useEffect(() => {
    if (loginStatus.status !== "uninitialized") {
      return;
    }

    api.basename = config.metabaseInstanceUrl;

    const authErrorMessage = match<[SDKConfig, string], string | void>([
      config,
      window.location.pathname,
    ])
      .with(
        [
          {
            apiKey: P.select("apiKey"),
            jwtProviderUri: P.select("jwtProviderUri", P.nullish),
          },
          "localhost",
        ],
        ({ apiKey }) => {
          presentApiKeyUsageWarning(appName);
          setupLocalApiKey(dispatch, apiKey);
        },
      )
      .with(
        [
          {
            apiKey: P.select("apiKey"),
            jwtProviderUri: P.select("jwtProviderUri", P.nullish),
          },
          P.not("localhost"),
        ],
        () => getErrorMessage("PROD_API_KEY"),
      )
      .with(
        [
          {
            apiKey: P.select("apiKey", P.nullish),
            jwtProviderUri: P.select("jwtProviderUri"),
          },
          P._,
        ],
        ({ jwtProviderUri }) => {
          setupJwtAuth(jwtProviderUri, dispatch);
        },
      )
      .with(
        [
          {
            apiKey: P.select("apiKey", P.nullish),
            jwtProviderUri: P.select("jwtProviderUri", P.nullish),
          },
          P._,
        ],
        () => getErrorMessage("NO_AUTH_PROVIDED"),
      )
      .otherwise(() => t`Unknown error`);

    if (authErrorMessage) {
      dispatch(
        setLoginStatus({
          status: "error",
          error: new Error(authErrorMessage),
        }),
      );
    }
  }, [appName, config, dispatch, loginStatus.status]);

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
                error: new Error(getErrorMessage("COULD_NOT_AUTHENTICATE")),
              }),
            );
            return;
          }

          dispatch(setLoginStatus({ status: "success" }));
        } catch (error) {
          dispatch(
            setLoginStatus({
              status: "error",
              error: new Error(getErrorMessage("COULD_NOT_AUTHENTICATE")),
            }),
          );
        }
      };

      fetchData();
    }
  }, [dispatch, loginStatus.status]);
};
