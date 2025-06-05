import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
  openSamlLoginPopup,
  samlTokenStorage,
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
import type { Settings } from "metabase-types/api";

import { getOrRefreshSession } from "../reducer";
import { getFetchRefreshTokenFn } from "../selectors";

export const initAuth = createAsyncThunk(
  "sdk/token/INIT_AUTH",
  async (
    { metabaseInstanceUrl, authMethod, apiKey }: MetabaseAuthConfig,
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
    } else if (isValidInstanceUrl) {
      // SSO setup
      api.onBeforeRequest = async () => {
        const session = await dispatch(
          getOrRefreshSession({
            metabaseInstanceUrl,
            authMethod,
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
            authMethod,
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
      authMethod,
    }: Pick<MetabaseAuthConfig, "metabaseInstanceUrl" | "authMethod">,
    { getState },
  ): Promise<MetabaseEmbeddingSessionToken | null> => {
    const customGetRefreshToken =
      getFetchRefreshTokenFn(getState() as SdkStoreState) ?? undefined;
    const session = await getRefreshToken({
      metabaseInstanceUrl,
      authMethod,
      fetchRequestToken: customGetRefreshToken,
    });
    validateSessionToken(session);

    return session;
  },
);

const getRefreshToken = async ({
  metabaseInstanceUrl,
  authMethod,
  fetchRequestToken: customGetRequestToken,
}: Pick<
  MetabaseAuthConfig,
  "metabaseInstanceUrl" | "fetchRequestToken" | "authMethod"
>) => {
  const urlResponseJson = await connectToInstanceAuthSso(metabaseInstanceUrl, {
    authMethod,
    headers: getSdkRequestHeaders(),
  });
  const { method, url: responseUrl, hash } = urlResponseJson || {};
  if (method === "saml") {
    return await openSamlLoginPopup(responseUrl);
  }
  if (method === "jwt") {
    return jwtDefaultRefreshTokenFunction(
      responseUrl,
      metabaseInstanceUrl,
      getSdkRequestHeaders(hash),
      customGetRequestToken,
    );
  }
  throw new Error(
    `Unknown or missing method: ${method}, response: ${JSON.stringify(urlResponseJson, null, 2)}`,
  );
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
