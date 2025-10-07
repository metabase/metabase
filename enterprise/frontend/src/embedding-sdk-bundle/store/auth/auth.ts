import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
  openSamlLoginPopup,
  samlTokenStorage,
  validateSession,
} from "embedding/auth-common";
import type {
  MetabaseAuthConfig,
  MetabaseEmbeddingSessionToken,
} from "embedding-sdk-bundle";
import { getEmbeddingSdkVersion } from "embedding-sdk-bundle/config";
import * as MetabaseError from "embedding-sdk-bundle/errors";
import { getIsLocalhost } from "embedding-sdk-bundle/lib/is-localhost";
import { isSdkVersionCompatibleWithMetabaseVersion } from "embedding-sdk-bundle/lib/version-utils";
import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import { EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG } from "metabase/embedding-sdk/config";
import api from "metabase/lib/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import { requestSessionTokenFromEmbedJs } from "metabase-enterprise/embedding_iframe_sdk/utils";
import type { Settings } from "metabase-types/api";

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
    validateSession(session);

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
    "X-Metabase-Client-Version": getEmbeddingSdkVersion(),
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
  };
}
