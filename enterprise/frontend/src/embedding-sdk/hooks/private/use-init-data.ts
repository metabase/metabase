import { useEffect } from "react";
import { useMount } from "react-use";
import { match } from "ts-pattern";
import _ from "underscore";

import type { SdkErrorStatus } from "embedding-sdk/components/private/SdkError/types/status";
import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import { setupSdkAuth } from "embedding-sdk/hooks";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import {
  refreshTokenAsync,
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
  const loginStatus = useSdkSelector(getLoginStatus);
  const dispatch = useSdkDispatch();

  const { allowConsoleLog = true } = config;

  useMount(() => {
    // This is outside of a useEffect otherwise calls done on the first render could use the wrong value
    // This is the case for example for the locale json files
    if (api.basename !== config.metabaseInstanceUrl) {
      api.basename = config.metabaseInstanceUrl;
    }

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

    dispatch(setFetchRefreshTokenFn(config.fetchRequestToken ?? null));
  });

  const handleError = (status: SdkErrorStatus) =>
    dispatch(
      setLoginStatus({
        status: "error",
        data: {
          status,
        },
      }),
    );

  const handleTokenValidation = async () => {
    const token = await dispatch(
      refreshTokenAsync(config.jwtProviderUri),
    ).unwrap();

    if (!token) {
      handleError("error-fe-cannot-refresh-token");
    } else if (token.status === "ok") {
      dispatch(
        setLoginStatus({
          status: "loading",
        }),
      );
    } else {
      if (token instanceof Response) {
        // handle the possibility that the client is using a custom
        // fetchRefreshTokenFn, and isn't returning json.
        handleError("error-fe-received-response-object");
      } else if (!isJsonObject(token)) {
        // handle the 'JSON could not be parsed' error somewhat gracefully
        handleError("error-fe-received-non-json-object");
      } else {
        handleError(token.status ?? "error-unknown");
      }
    }
  };

  const handleLoading = async () =>
    await Promise.all([
      dispatch(refreshCurrentUser()),
      dispatch(refreshSiteSettings({})),
    ])
      .then(([userResponse, siteSettingsResponse]) => {
        if (
          userResponse.meta.requestStatus === "rejected" ||
          siteSettingsResponse.meta.requestStatus === "rejected"
        ) {
          dispatch(
            setLoginStatus({
              status: "error",
              data: {
                status: "error-fe-cannot-authenticate",
              },
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
            data: {
              status: "error-fe-cannot-authenticate",
            },
          }),
        );
      });

  useEffect(() => {
    match(loginStatus.status)
      .with("uninitialized", () => {
        if (!config.jwtProviderUri && !config.apiKey) {
          handleError("error-fe-bad-jwt-provider-uri");
        }
        setupSdkAuth(config, dispatch);
      })
      .with("validated", handleTokenValidation)
      .with("loading", handleLoading)
      .otherwise(() => null);
  });
};

function isJsonObject(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
