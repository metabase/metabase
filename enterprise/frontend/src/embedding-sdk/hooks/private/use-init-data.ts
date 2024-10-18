import { useEffect } from "react";
import _ from "underscore";

import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import { setupSdkAuth } from "embedding-sdk/hooks";
import { COULD_NOT_AUTHENTICATE_MESSAGE } from "embedding-sdk/lib/user-warnings";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import {
  getOrRefreshSession,
  setFetchRefreshTokenFn,
  setLoginStatus,
} from "embedding-sdk/store/reducer";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import type { SDKConfig } from "embedding-sdk/types";
import api from "metabase/lib/api";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import registerVisualizations from "metabase/visualizations/register";
import { useMount } from "react-use";
import { match } from "ts-pattern";
import {
  handleServerError,
  MetabaseSdkError,
} from "embedding-sdk/lib/error/error";

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

  useMount(() => {
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
  });

  match(loginStatus.status)
    .with("uninitialized", () => {
      setupSdkAuth(config, dispatch);
      dispatch(setLoginStatus({ status: "validated" }));
    })
    .with("validated", async () => {
      if (config.jwtProviderUri) {
        await dispatch(getOrRefreshSession(config.jwtProviderUri))
          .unwrap()
          .then(response => {
            console.log("getOrRefreshSession", response)
            if (!response) {
              handleServerError("error-fe-cannot-authenticate");
            } else if (response instanceof Response) {
              handleServerError("error-fe-received-response-object");
            } else if (!(response instanceof Object)) {
              handleServerError("error-fe-received-non-json-object");
            } else {
              dispatch(setLoginStatus({ status: "loading" }));
            }
          })
          .catch(e => {
            dispatch(
              setLoginStatus({
                status: "error",
                error: e,
              }),
            );
          });
      }
    })
    .with("loading", async () => {
      Promise.all([
        dispatch(refreshCurrentUser()),
        dispatch(refreshSiteSettings({})),
      ])
        .then(([userResponse, siteSettingsResponse]) => {
          console.log({
            userResponse,siteSettingsResponse
          })
          if (
            userResponse.meta.requestStatus === "rejected" ||
            siteSettingsResponse.meta.requestStatus === "rejected"
          ) {
            handleServerError("error-fe-cannot-authenticate");
          }

          dispatch(
            setLoginStatus({
              status: "success",
            }),
          );
        })
        .catch(error => {
          dispatch(
            setLoginStatus({
              status: "error",
              error: error,
            }),
          );
        });
    })
    .with("error", () => {})
    .with("success", () => {})
    .exhaustive();
};
