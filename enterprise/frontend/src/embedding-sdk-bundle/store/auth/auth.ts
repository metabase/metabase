import { EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION } from "build-configs/embedding-sdk/constants/versions";
import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
  openSamlLoginPopup,
  samlTokenStorage,
  validateSessionToken,
} from "embedding/auth-common";
import * as MetabaseError from "embedding-sdk-bundle/errors";
import { getIsLocalhost } from "embedding-sdk-bundle/lib/is-localhost";
import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import type { MetabaseEmbeddingSessionToken } from "embedding-sdk-bundle/types/refresh-token";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
import { EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG } from "metabase/embedding-sdk/config";
import api from "metabase/lib/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import { requestSessionTokenFromEmbedJs } from "metabase-enterprise/embedding_iframe_sdk/utils";

import { getOrRefreshSession } from "../reducer";
import { getFetchRefreshTokenFn } from "../selectors";

export const initAuth = createAsyncThunk(
  "sdk/token/INIT_AUTH",
  async (
    { metabaseInstanceUrl, preferredAuthMethod, apiKey }: MetabaseAuthConfig,
    { dispatch },
  ) => {
    // remove any stale tokens that might be there from a previous session=
    samlTokenStorage.remove();

    // Setup JWT or API key
    const isValidInstanceUrl =
      metabaseInstanceUrl && metabaseInstanceUrl?.length > 0;
    const isValidApiKeyConfig = apiKey && getIsLocalhost();

    if (isValidApiKeyConfig) {
      // API key setup
      api.apiKey = apiKey;
    } else if (EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.useExistingUserSession) {
      // Use existing user session. Do nothing.
    } else if (isValidInstanceUrl) {
      // SSO setup
      api.onBeforeRequest = async () => {
        const session = await dispatch(
          getOrRefreshSession({
            metabaseInstanceUrl,
            preferredAuthMethod,
          }),
        ).unwrap();
        if (session?.id) {
          api.sessionToken = session.id;
        }
      };
      try {
        // verify that the session is actually valid before proceeding
        await dispatch(
          getOrRefreshSession({
            metabaseInstanceUrl,
            preferredAuthMethod,
          }),
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

    if (!user.payload) {
      if (EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.useExistingUserSession) {
        throw MetabaseError.EXISTING_USER_SESSION_FAILED();
      }

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
    {
      metabaseInstanceUrl,
      preferredAuthMethod,
    }: Pick<MetabaseAuthConfig, "metabaseInstanceUrl" | "preferredAuthMethod">,
    { getState },
  ): Promise<MetabaseEmbeddingSessionToken | null> => {
    const state = getState() as SdkStoreState;

    if (EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSimpleEmbedding) {
      return requestSessionTokenFromEmbedJs();
    }

    const customGetRefreshToken = getFetchRefreshTokenFn(state) ?? undefined;

    const session = await getRefreshToken({
      metabaseInstanceUrl,
      preferredAuthMethod,
      fetchRequestToken: customGetRefreshToken,
    });
    validateSessionToken(session);

    return session;
  },
);

const getRefreshToken = async ({
  metabaseInstanceUrl,
  preferredAuthMethod,
  fetchRequestToken: customGetRequestToken,
}: Pick<
  MetabaseAuthConfig,
  "metabaseInstanceUrl" | "fetchRequestToken" | "preferredAuthMethod"
>) => {
  const urlResponseJson = await connectToInstanceAuthSso(metabaseInstanceUrl, {
    preferredAuthMethod,
    headers: getSdkRequestHeaders(),
  });
  const { method, url: responseUrl, hash } = urlResponseJson || {};
  if (method === "saml") {
    const token = await openSamlLoginPopup(responseUrl);
    samlTokenStorage.set(token);

    return token;
  }
  if (method === "jwt") {
    return jwtDefaultRefreshTokenFunction(
      responseUrl,
      metabaseInstanceUrl,
      getSdkRequestHeaders(hash),
      customGetRequestToken,
    );
  }
  throw MetabaseError.INVALID_AUTH_METHOD({ method });
};

export function getSdkRequestHeaders(hash?: string): Record<string, string> {
  return {
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client": "embedding-sdk-react",
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client-Version":
      getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO").version ??
      EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION,
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
  };
}
