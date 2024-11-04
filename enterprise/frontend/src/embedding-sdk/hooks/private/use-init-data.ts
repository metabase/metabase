import { useEffect } from "react";
import _ from "underscore";

import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import { setupSdkAuth } from "embedding-sdk/hooks";
import { COULD_NOT_AUTHENTICATE_MESSAGE } from "embedding-sdk/lib/user-warnings";
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
  const { allowConsoleLog = true } = config;

  // This is outside of a useEffect otherwise calls done on the first render could use the wrong value
  // This is the case for example for the locale json files
  if (api.basename !== config.metabaseInstanceUrl) {
    api.basename = config.metabaseInstanceUrl;
  }

  const dispatch = useSdkDispatch();
  const loginStatus = useSdkSelector(getLoginStatus);

  useEffect(() => {
    registerVisualizationsOnce();

    const EMBEDDING_SDK_VERSION = getEmbeddingSdkVersion();
    api.requestClient = {
      name: "embedding-sdk-react",
      version: EMBEDDING_SDK_VERSION,
    };

    if (allowConsoleLog) {
      // eslint-disable-next-line no-console
      console.log(
        // eslint-disable-next-line no-literal-metabase-strings -- Not a user facing string
        `Using Metabase Embedding SDK, version ${EMBEDDING_SDK_VERSION}`,
      );
    }
  }, [allowConsoleLog]);

  useEffect(() => {
    dispatch(setFetchRefreshTokenFn(config.fetchRequestToken ?? null));
  }, [dispatch, config.fetchRequestToken]);

  useEffect(() => {
    if (loginStatus.status !== "uninitialized") {
      return;
    }

    setupSdkAuth(config, dispatch);
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
                error: new Error(COULD_NOT_AUTHENTICATE_MESSAGE),
              }),
            );
            return;
          }

          dispatch(setLoginStatus({ status: "success" }));
        } catch (error) {
          dispatch(
            setLoginStatus({
              status: "error",
              error: new Error(COULD_NOT_AUTHENTICATE_MESSAGE),
            }),
          );
        }
      };

      fetchData();
    }
  }, [dispatch, loginStatus.status]);
};
