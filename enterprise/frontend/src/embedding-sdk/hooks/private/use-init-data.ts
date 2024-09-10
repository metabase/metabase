import { useEffect } from "react";
import _ from "underscore";

import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import { getAuthConfiguration } from "embedding-sdk/hooks/private/get-auth-configuration";
import { getErrorMessage } from "embedding-sdk/lib/user-warnings";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import {
  setFetchRefreshTokenFn,
  setLoginStatus,
} from "embedding-sdk/store/reducer";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import type { SDKConfig } from "embedding-sdk/types";
import api from "metabase/lib/api";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import registerVisualizations from "metabase/visualizations/register";

const registerVisualizationsOnce = _.once(registerVisualizations);

interface InitDataLoaderParameters {
  config: SDKConfig;
}

export const useInitData = ({ config }: InitDataLoaderParameters) => {
  const dispatch = useSdkDispatch();
  const loginStatus = useSdkSelector(getLoginStatus);

  useEffect(() => {
    registerVisualizationsOnce();

    const EMBEDDING_SDK_VERSION = getEmbeddingSdkVersion();
    api.requestClient = {
      name: "embedding-sdk-react",
      version: EMBEDDING_SDK_VERSION,
    };

    // eslint-disable-next-line no-console
    console.log(
      // eslint-disable-next-line no-literal-metabase-strings -- Not a user facing string
      `Using Metabase Embedding SDK, version ${EMBEDDING_SDK_VERSION}`,
    );
  }, []);

  useEffect(() => {
    dispatch(setFetchRefreshTokenFn(config.fetchRequestToken ?? null));
  }, [dispatch, config.fetchRequestToken]);

  useEffect(() => {
    if (loginStatus.status !== "uninitialized") {
      return;
    }

    api.basename = config.metabaseInstanceUrl;

    const authErrorMessage = getAuthConfiguration(config, dispatch);

    if (authErrorMessage) {
      dispatch(
        setLoginStatus({
          status: "error",
          error: new Error(authErrorMessage),
        }),
      );
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
