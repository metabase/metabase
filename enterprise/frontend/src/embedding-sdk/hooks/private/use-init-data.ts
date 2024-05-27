import { useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import {
  getOrRefreshSession,
  setLoginStatus,
} from "embedding-sdk/store/reducer";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import type {
  EmbeddingSessionTokenState,
  SdkDispatch,
} from "embedding-sdk/store/types";
import type { SDKConfig } from "embedding-sdk/types";
import api from "metabase/lib/api";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import registerVisualizations from "metabase/visualizations/register";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  config: SDKConfig;
}

const isValidJwtAuth = (config: SDKConfig) => !!config.jwtProviderUri;

const setupJwtAuth = (config: SDKConfig, dispatch: SdkDispatch) => {
  api.onBeforeRequest = async () => {
    const tokenState = await dispatch(
      getOrRefreshSession(config.jwtProviderUri),
    );

    api.sessionToken = (
      tokenState.payload as EmbeddingSessionTokenState["token"]
    )?.id;
  };
};

export const useInitData = ({ config }: InitDataLoaderParameters) => {
  const dispatch = useSdkDispatch();

  const loginStatus = useSdkSelector(getLoginStatus);

  useEffect(() => {
    registerVisualizationsOnce();
  }, [dispatch]);

  useEffect(() => {
    if (loginStatus.status === "uninitialized") {
      api.basename = config.metabaseInstanceUrl;

      if (isValidJwtAuth(config)) {
        setupJwtAuth(config, dispatch);
        dispatch(setLoginStatus({ status: "validated" }));
      } else {
        dispatch(
          setLoginStatus({
            status: "error",
            error: new Error(t`Invalid JWT URI provided.`),
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
            dispatch(refreshSiteSettings()),
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
