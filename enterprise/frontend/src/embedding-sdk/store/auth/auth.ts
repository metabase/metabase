import * as Yup from "yup";

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

import { jwtDefaultRefreshTokenFunction } from "./jwt";
import { openSamlLoginPopup } from "./saml";
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
    const customGetRefreshToken =
      getFetchRefreshTokenFn(getState() as SdkStoreState) ?? null;

    const session = await getRefreshToken(url, customGetRefreshToken);

    if (!session || typeof session !== "object") {
      throw MetabaseError.INVALID_SESSION_OBJECT({
        expected: "{ jwt: string }",
        actual: JSON.stringify(session, null, 2),
      });
    }
    if ("status" in session && session.status !== "ok") {
      if ("message" in session && typeof session.message === "string") {
        throw MetabaseError.INVALID_SESSION_OBJECT({
          expected: "{ jwt: string }",
          actual: session.message,
        });
      }
      if (typeof session.status === "string") {
        throw MetabaseError.INVALID_SESSION_OBJECT({
          expected: "{ jwt: string }",
          actual: session.status,
        });
      }
    }
    if (!sessionSchema.isValidSync(session)) {
      throw MetabaseError.INVALID_SESSION_SCHEMA({
        expected: "{ id: string, exp: number, iat: number, status: string }",
        actual: JSON.stringify(session, null, 2),
      });
    }
    return session;
  },
);

const getRefreshToken = async (
  url: MetabaseAuthConfig["metabaseInstanceUrl"],
  customFetchRequestToken:
    | MetabaseAuthConfig["fetchRequestToken"]
    | null = null,
) => {
  const urlResponseJson = await connectToInstanceAuthSso(url);
  const { method, url: responseUrl, hash } = urlResponseJson || {};
  if (method === "saml") {
    return await openSamlLoginPopup(responseUrl);
  }
  if (method === "jwt") {
    return jwtDefaultRefreshTokenFunction(
      responseUrl,
      url,
      hash,
      customFetchRequestToken,
    );
  }
  throw new Error(
    `Unknown or missing method: ${method}, response: ${JSON.stringify(urlResponseJson, null, 2)}`,
  );
};

const sessionSchema = Yup.object({
  id: Yup.string().required(),
  exp: Yup.number().required(),
  // We should also receive `iat` and `status` in the response, but we don't actually need them
  // as we don't use them, so we don't throw an error if they are missing
});

async function connectToInstanceAuthSso(url: string) {
  try {
    const urlResponse = await fetch(`${url}/auth/sso`, getSdkRequestHeaders());
    if (!urlResponse.ok) {
      throw MetabaseError.CANNOT_CONNECT_TO_INSTANCE({
        instanceUrl: url,
        status: urlResponse.status,
      });
    }
    return await urlResponse.json();
  } catch (e) {
    // If the error is already a MetabaseError, just rethrow
    if (e instanceof MetabaseError.MetabaseError) {
      throw e;
    }
    throw MetabaseError.CANNOT_CONNECT_TO_INSTANCE({
      instanceUrl: url,
      status: (e as any)?.status,
    });
  }
}

export function getSdkRequestHeaders(hash?: string) {
  return {
    headers: {
      // eslint-disable-next-line no-literal-metabase-strings -- header name
      "X-Metabase-Client": "embedding-sdk-react",
      // eslint-disable-next-line no-literal-metabase-strings -- header name
      "X-Metabase-Client-Version": getEmbeddingSdkVersion(),
      // eslint-disable-next-line no-literal-metabase-strings -- header name
      ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
    },
  };
}
