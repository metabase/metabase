import * as Yup from "yup";

import type {
  MetabaseAuthConfig,
  MetabaseEmbeddingSessionToken,
} from "embedding-sdk";
import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import { getIsLocalhost } from "embedding-sdk/lib/is-localhost";
import { bigErrorHeader, bigWarningHeader } from "embedding-sdk/lib/log-utils";
import { isSdkVersionCompatibleWithMetabaseVersion } from "embedding-sdk/lib/version-utils";
import type { SdkStoreState } from "embedding-sdk/store/types";
import api from "metabase/lib/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import type { Settings } from "metabase-types/api";

import { getOrRefreshSession } from "../reducer";
import { getFetchRefreshTokenFn } from "../selectors";

import { jwtRefreshTokenFn } from "./jwt";
import { popupRefreshTokenFn } from "./popup";

export const initAuth = createAsyncThunk(
  "sdk/token/INIT_AUTH",
  async (authConfig: MetabaseAuthConfig, { dispatch }) => {
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
      // verify that the session is actually valid before proceeding
      await dispatch(
        getOrRefreshSession(authConfig.metabaseInstanceUrl),
      ).unwrap();
    }

    // Fetch user and site settings
    const [user, siteSettings] = await Promise.all([
      dispatch(refreshCurrentUser()),
      dispatch(refreshSiteSettings()),
    ]);

    const mbVersion = (siteSettings.payload as Settings)?.version?.tag;
    const sdkVersion = getEmbeddingSdkVersion();

    if (mbVersion && sdkVersion !== "unknown") {
      if (
        !isSdkVersionCompatibleWithMetabaseVersion({
          mbVersion,
          sdkVersion,
        })
      ) {
        console.warn(
          ...bigWarningHeader("Detected SDK compatibility issue"),
          `SDK version ${sdkVersion} is not compatible with MB version ${mbVersion}, this might cause issues.`,
          // eslint-disable-next-line no-unconditional-metabase-links-render -- console log in case of issues
          "Learn more at https://www.metabase.com/docs/latest/embedding/sdk/version",
        );
      }
    }

    if (!user.payload) {
      // The refresh user thunk just returns null if it fails to fetch the user, it doesn't throw
      const error = new Error(
        "Failed to fetch the user, the session might be invalid.",
      );
      console.error(error);
      throw error;
    }
    if (!siteSettings.payload) {
      const error = new Error(
        "Failed to fetch the site settings, the session might be invalid.",
      );
      console.error(error);
      throw error;
    }
  },
);

export const refreshTokenAsync = createAsyncThunk(
  "sdk/token/REFRESH_TOKEN",
  async (
    url: MetabaseAuthConfig["metabaseInstanceUrl"],
    { getState },
  ): Promise<MetabaseEmbeddingSessionToken | null> => {
    // The SDK user can provide a custom function to refresh the token.
    const customGetRefreshToken = getFetchRefreshTokenFn(
      getState() as SdkStoreState,
    );

    // # How does the error handling work?
    // This is an async thunk, thunks _by design_ can fail and no error will be shown on the console (it's the reducer that should handle the reject action)
    // The following lines are wrapped in a try/catch block that will catch any errors thrown, log them to the console as a big red errors, and re-throw them to make the thunk reject
    // In this way we also support standard thrown Errors in the custom fetchRequestToken user provided function

    try {
      const session = await getRefreshToken(url, customGetRefreshToken);
      const source = customGetRefreshToken
        ? '"fetchRequestToken"'
        : "authProviderUri endpoint";

      if (!session || typeof session !== "object") {
        throw new Error(
          `The ${source} must return an object with the shape {id:string, exp:number, iat:number, status:string}, got ${safeStringify(session)} instead`,
        );
      }
      if ("status" in session && session.status !== "ok") {
        if ("message" in session && typeof session.message === "string") {
          // For some errors, the BE gives us a message that explains it
          throw new Error(session.message);
        }
        if (typeof session.status === "string") {
          // other times it just returns an error code
          throw new Error(
            `Failed to refresh token, got status: ${session.status}`,
          );
        }
      }
      // Lastly if we don't have an error message or status, check if we actually got the session ID and expiration
      if (!sessionSchema.isValidSync(session)) {
        throw new Error(
          `The ${source} must return an object with the shape {id:string, exp:number, iat:number, status:string}, got ${safeStringify(session)} instead`,
        );
      }
      return session;
    } catch (exception: unknown) {
      // The host app may have a lot of logs (and the sdk logs a lot too), so we
      // make a big red error message to make it visible as this is 90% a blocking error
      console.error(...bigErrorHeader("Failed to get auth session"), exception);

      throw exception;
    }
  },
);

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return value;
  }
};

const getRefreshToken = async (
  url: MetabaseAuthConfig["metabaseInstanceUrl"],
  customFetchRequestFunction: MetabaseAuthConfig["fetchRequestToken"],
) => {
  // GET /auth/sso with headers
  const urlResponse = await fetch(`${url}/auth/sso`, getFetchParams());
  const urlResponseJson = await urlResponse.json();

  // For the SDK, both SAML and JWT endpoints return {url: [...], method: "saml" | "jwt"}
  // when the headers are passed
  const { method, url: responseUrl, hash } = urlResponseJson;

  if (method === "saml") {
    // The URL should point to the SAML IDP
    return popupRefreshTokenFn(responseUrl);
  }

  return jwtRefreshTokenFn(responseUrl, hash, customFetchRequestFunction);
};

const sessionSchema = Yup.object({
  id: Yup.string().required(),
  exp: Yup.number().required(),
  // We should also receive `iat` and `status` in the response, but we don't actually need them
  // as we don't use them, so we don't throw an error if they are missing
});

export function getFetchParams(hash: string | undefined = undefined) {
  const EMBEDDING_SDK_VERSION = getEmbeddingSdkVersion();
  const hashHeader:
    | {
        // eslint-disable-next-line no-literal-metabase-strings -- header name
        readonly "X-Metabase-SDK-JWT-Hash": string;
      }
    | Record<string, never> = hash
    ? ({
        // eslint-disable-next-line no-literal-metabase-strings -- header name
        "X-Metabase-SDK-JWT-Hash": hash,
      } as const)
    : ({} as const);
  const fetchParams: RequestInit = {
    method: "GET",
    headers: {
      // eslint-disable-next-line no-literal-metabase-strings -- header name
      "X-Metabase-Client": "embedding-sdk-react",
      // eslint-disable-next-line no-literal-metabase-strings -- header name
      "X-Metabase-Client-Version": EMBEDDING_SDK_VERSION,
      ...hashHeader,
    },
  };
  return fetchParams;
}
