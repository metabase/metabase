import type { EmbeddingSessionToken, SDKConfig } from "embedding-sdk";
import { COULD_NOT_AUTHENTICATE_MESSAGE } from "embedding-sdk/lib/user-warnings";
import {
  getOrRefreshSession,
  setLoginStatus,
} from "embedding-sdk/store/reducer";
import type { SdkDispatch } from "embedding-sdk/store/types";
import api from "metabase/lib/api";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";

export const setupSdkAuth = async (
  config: SDKConfig,
  dispatch: SdkDispatch,
) => {
  if (config.jwtProviderUri && window.location.hostname) {
    // JWT setup
    api.onBeforeRequest = async () => {
      const tokenState = await dispatch(
        getOrRefreshSession(config.jwtProviderUri),
      );

      api.sessionToken = (
        tokenState.payload as EmbeddingSessionToken | null
      )?.id;
    };
  } else if (config.apiKey && window.location.hostname === "localhost") {
    // API KEY setup
    api.apiKey = config.apiKey;
  }

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
