import { useCallback, useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import {
  getOrRefreshSession,
  setLoginStatus,
} from "embedding-sdk/store/reducer";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import type { EmbeddingSessionTokenState } from "embedding-sdk/store/types";
import type {
  SDKConfigType,
  SdkConfigWithApiKey,
  SdkConfigWithJWT,
} from "embedding-sdk/types";
import { reloadSettings } from "metabase/admin/settings/settings";
import api from "metabase/lib/api";
import { refreshCurrentUser } from "metabase/redux/user";
import registerVisualizations from "metabase/visualizations/register";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  config: SDKConfigType;
}

const getErrorMessage = (authType: SDKConfigType["authType"] | string) => {
  if (authType === "jwt") {
    return t`Could not authenticate: invalid JWT URI or JWT provider did not return a valid JWT token`;
  }

  if (authType === "apiKey") {
    return t`Could not authenticate: invalid API key`;
  }

  return t`Invalid auth type`;
};

const isJwtAuth = (config: SDKConfigType): config is SdkConfigWithJWT =>
  config.authType === "jwt" && !!config.jwtProviderUri;

const isApiKeyAuth = (config: SDKConfigType): config is SdkConfigWithApiKey =>
  config.authType === "apiKey" && !!config.apiKey;

export const useInitData = ({ config }: InitDataLoaderParameters) => {
  const dispatch = useSdkDispatch();

  const loginStatus = useSdkSelector(getLoginStatus);

  useEffect(() => {
    registerVisualizationsOnce();
    dispatch(setLoginStatus({ status: "uninitialized" }));
  }, [dispatch]);

  const setupJwtAuth = useCallback(
    (config: SdkConfigWithJWT) => {
      api.onBeforeRequest = async () => {
        const tokenState = await dispatch(
          getOrRefreshSession(config.jwtProviderUri),
        );

        api.sessionToken = (
          tokenState.payload as EmbeddingSessionTokenState["token"]
        )?.id;
      };
      dispatch(setLoginStatus({ status: "initialized" }));
    },
    [dispatch],
  );

  const setupApiKeyAuth = useCallback(
    (config: SdkConfigWithApiKey) => {
      api.apiKey = config.apiKey;
      dispatch(setLoginStatus({ status: "initialized" }));
    },
    [dispatch],
  );

  useEffect(() => {
    if (loginStatus.status === "uninitialized") {
      api.basename = config.metabaseInstanceUrl;

      if (isJwtAuth(config)) {
        setupJwtAuth(config);
      } else if (isApiKeyAuth(config)) {
        setupApiKeyAuth(config);
      } else {
        dispatch(
          setLoginStatus({
            status: "error",
            error: new Error(getErrorMessage(config.authType)),
          }),
        );
      }
    }
  }, [
    config,
    config.authType,
    config.metabaseInstanceUrl,
    dispatch,
    loginStatus.status,
    setupApiKeyAuth,
    setupJwtAuth,
  ]);

  useEffect(() => {
    if (loginStatus.status === "initialized") {
      const fetchData = async () => {
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
      };

      fetchData();
    }
  }, [config.authType, dispatch, loginStatus.status]);
};
