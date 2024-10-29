import type { SDKConfig } from "embedding-sdk";
import {
  getOrRefreshSession,
  setLoginStatus,
} from "embedding-sdk/store/reducer";
import type { SdkDispatch } from "embedding-sdk/store/types";
import api from "metabase/lib/api";

export const setupSdkAuth = (config: SDKConfig, dispatch: SdkDispatch) => {
  const isValidJwtConfig =
    config.jwtProviderUri && config.jwtProviderUri?.length > 0;
  const isValidApiKeyConfig =
    config.apiKey && window.location.hostname === "localhost";

  if (isValidJwtConfig) {
    api.onBeforeRequest = async () => {
      const session = await dispatch(
        getOrRefreshSession(config.jwtProviderUri!),
      ).unwrap();
      if (session?.id) {
        api.sessionToken = session.id;
      }
    };
    dispatch(setLoginStatus({ status: "validated" }));
  } else if (isValidApiKeyConfig) {
    api.apiKey = config.apiKey;
    dispatch(setLoginStatus({ status: "validated" }));
  }
};
