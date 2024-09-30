import { P, match } from "ts-pattern";

import type { EmbeddingSessionToken, SDKConfig } from "embedding-sdk";
import {
  getOrRefreshSession,
  setLoginStatus,
} from "embedding-sdk/store/reducer";
import type { SdkDispatch } from "embedding-sdk/store/types";
import type {
  SDKConfigWithApiKey,
  SDKConfigWithJWT,
} from "embedding-sdk/types";
import api from "metabase/lib/api";
import type { Dispatch } from "metabase-types/store";

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

export const setupSdkAuth = (config: SDKConfig, dispatch: Dispatch) =>
  match<[SDKConfig, string], string | void>([config, window.location.hostname])
    .with(
      [
        {
          jwtProviderUri: P.select(P.nonNullable.and(P.string.minLength(1))),
        },
        P._,
      ],
      jwtProviderUri => setupJwtAuth(jwtProviderUri, dispatch),
    )
    .with([{ apiKey: P.select(P.nonNullable) }, "localhost"], apiKey => {
      setupLocalApiKey(dispatch, apiKey);
    });
