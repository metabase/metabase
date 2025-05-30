import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
  openSamlLoginPopup,
  validateSessionToken,
} from "embedding/auth-common";
import type {
  MetabaseAuthConfig,
  MetabaseEmbeddingSessionToken,
} from "embedding-sdk";
import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import * as MetabaseError from "embedding-sdk/errors";
import { getIsLocalhost } from "embedding-sdk/lib/is-localhost";
import { isSdkVersionCompatibleWithMetabaseVersion } from "embedding-sdk/lib/version-utils";
import type { SdkStoreState } from "embedding-sdk/store/types";
import api from "metabase/lib/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import { requestSessionTokenFromEmbedJs } from "metabase-enterprise/embedding_iframe_sdk/utils";
import type { Settings } from "metabase-types/api";

import { getOrRefreshSession } from "../reducer";
import {
  getFetchRefreshTokenFn,
  getIsNewIframeEmbeddingAuth,
} from "../selectors";

import { samlTokenStorage } from "./saml-token-storage";

export const initAuth = createAsyncThunk(
  "sdk/token/INIT_AUTH",
  async (authConfig: MetabaseAuthConfig, { dispatch }) => {
    // remove any stale tokens that might be there from a previous session=
    samlTokenStorage.remove();

    // Setup JWT or API key
    const isValidInstanceUrl =
      authConfig.metabaseInstanceUrl &&
      authConfig.metabaseInstanceUrl?.length > 0;
    const isValidApiKeyConfig = authConfig.apiKey && getIsLocalhost();

    if (isValidApiKeyConfig) {
      // API key setup
      api.apiKey = authConfig.apiKey;
    } else if (isValidInstanceUrl) {
      // SSO setup
      api.onBeforeRequest = async () => {
        const session = await dispatch(
          getOrRefreshSession(authConfig.metabaseInstanceUrl),
        ).unwrap();
        if (session?.id) {
          api.sessionToken = session.id;
        }
      };
      try {
        // verify that the session is actually valid before proceeding
        await dispatch(
          getOrRefreshSession(authConfig.metabaseInstanceUrl),
        ).unwrap();
      } catch (e) {
        // TODO: Fix this. For some reason the instanceof check keeps returning `false`. I'd rather not do this
        // but due to time constraints this is what we have to do to make sure tests pass.
        // eslint-disable-next-line no-literal-metabase-strings -- error checking for better errors. should be improved in the future.
        if ((e as Error).name === "MetabaseError") {
          throw e;
        }
        throw MetabaseError.REFRESH_TOKEN_BACKEND_ERROR(e as Error);
      }
    }

    // Fetch user and site settings
    const [user, siteSettings] = await Promise.all([
      dispatch(refreshCurrentUser()),
      dispatch(refreshSiteSettings()),
    ]);

    const mbVersion = (siteSettings.payload as Settings)?.version?.tag;
    const sdkVersion = getEmbeddingSdkVersion();

    if (
      mbVersion &&
      sdkVersion !== "unknown" &&
      !isSdkVersionCompatibleWithMetabaseVersion({ mbVersion, sdkVersion })
    ) {
      console.warn(
        `SDK version ${sdkVersion} is not compatible with MB version ${mbVersion}, this might cause issues.`,
        // eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins.
        "Learn more at https://www.metabase.com/docs/latest/embedding/sdk/version",
      );
    }

    if (!user.payload) {
      throw MetabaseError.USER_FETCH_FAILED();
    }
    if (!siteSettings.payload) {
      throw MetabaseError.USER_FETCH_FAILED();
    }
  },
);

export const refreshTokenAsync = createAsyncThunk(
  "sdk/token/REFRESH_TOKEN",
  async (
    url: MetabaseAuthConfig["metabaseInstanceUrl"],
    { getState },
  ): Promise<MetabaseEmbeddingSessionToken | null> => {
    const state = getState() as SdkStoreState;

    if (getIsNewIframeEmbeddingAuth(state)) {
      return requestSessionTokenFromEmbedJs();
    }

    const customGetRefreshToken = getFetchRefreshTokenFn(state) ?? null;

    const session = await getRefreshToken(url, customGetRefreshToken);
    validateSessionToken(session);

    return session;
  },
);

const getRefreshToken = async (
  url: MetabaseAuthConfig["metabaseInstanceUrl"],
  customFetchRequestToken:
    | MetabaseAuthConfig["fetchRequestToken"]
    | null = null,
) => {
  const urlResponseJson = await connectToInstanceAuthSso(
    url,
    getSdkRequestHeaders(),
  );
  const { method, url: responseUrl, hash } = urlResponseJson || {};
  if (method === "saml") {
    const token = await openSamlLoginPopup(responseUrl);
    samlTokenStorage.set(token);

    return token;
  }
  if (method === "jwt") {
    return jwtDefaultRefreshTokenFunction(
      responseUrl,
      url,
      getSdkRequestHeaders(hash),
      customFetchRequestToken,
    );
  }
  throw MetabaseError.MISSING_AUTH_METHOD({
    method,
    response: urlResponseJson,
  });
};

export function getSdkRequestHeaders(hash?: string): Record<string, string> {
  return {
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client": "embedding-sdk-react",
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client-Version": getEmbeddingSdkVersion(),
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
  };
}
