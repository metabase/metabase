// This file contains plugins that are needed to make the sdk bundle work.

import type { AsyncThunkAction } from "@reduxjs/toolkit";

import { EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION } from "build-configs/embedding-sdk/constants/versions";
import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
  openSamlLoginPopup,
  validateSession,
} from "embedding/auth-common";
import * as MetabaseError from "embedding-sdk-bundle/errors";
import { getIsLocalhost } from "embedding-sdk-bundle/lib/get-is-localhost";
import { PLUGIN_EMBEDDING_SDK_AUTH } from "embedding-sdk-bundle/store/auth";
import {
  getFetchRefreshTokenFn,
  getSessionTokenState,
} from "embedding-sdk-bundle/store/selectors";
import type {
  SdkDispatch,
  SdkStoreState,
} from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
import {
  readAuthState,
  waitForAuthCompletion,
} from "embedding-sdk-shared/lib/jwt-auth-standalone";
import { requestSessionTokenFromEmbedJs } from "metabase/embedding/embedding-iframe-sdk/utils";
import { EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG } from "metabase/embedding-sdk/config";
import { samlTokenStorage } from "metabase/embedding-sdk/lib/saml-token-storage";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import api from "metabase/lib/api";
import { createAsyncThunk } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { loadSettings, refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";

const GET_OR_REFRESH_SESSION = "sdk/token/GET_OR_REFRESH_SESSION";

let refreshTokenPromise: ReturnType<
  AsyncThunkAction<MetabaseEmbeddingSessionToken | null, unknown, any>
> | null = null;

// Side effect happening here.
PLUGIN_EMBEDDING_SDK_AUTH.initAuth = async (
  config: MetabaseAuthConfig & { isLocalHost?: boolean },
  { dispatch }: { dispatch: SdkDispatch },
) => {
  const { metabaseInstanceUrl, preferredAuthMethod, apiKey, isLocalHost } =
    config;
  const jwtProviderUri =
    preferredAuthMethod === "jwt" && "jwtProviderUri" in config
      ? config.jwtProviderUri
      : undefined;
  // remove any stale tokens that might be there from a previous session=
  samlTokenStorage.remove();

  // Setup JWT or API key
  const isValidInstanceUrl =
    metabaseInstanceUrl && metabaseInstanceUrl?.length > 0;
  const isValidApiKeyConfig = apiKey && (isLocalHost || getIsLocalhost());

  if (isValidApiKeyConfig) {
    // API key setup
    api.apiKey = apiKey;
  } else if (EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.useExistingUserSession) {
    // Use existing user session. Do nothing.
  } else if (isValidInstanceUrl) {
    // SSO setup
    PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.getOrRefreshSessionHandler =
      async () => {
        const session = await dispatch(
          getOrRefreshSession({
            metabaseInstanceUrl,
            preferredAuthMethod,
            jwtProviderUri,
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
          jwtProviderUri,
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

  // Fetch user and site settings (or use cached from package)
  // IMPORTANT: Read auth state AFTER getOrRefreshSession completes
  // (in case we waited for package auth to finish)
  let user, siteSettings;

  const authState = readAuthState();
  console.log("[bundle] Auth state after getOrRefreshSession:", {
    status: authState.status,
    hasUser: !!authState.user,
    hasSiteSettings: !!authState.siteSettings,
  });
  const hasPackagePrefetch =
    authState.status === "completed" &&
    authState.user &&
    authState.siteSettings;

  if (hasPackagePrefetch) {
    console.log(
      "[bundle] Using prefetched user and site settings from package",
    );
    // Use cached data instead of making requests
    // Dispatch fulfilled actions to populate Redux store
    user = await dispatch(
      refreshCurrentUser.fulfilled(
        authState.user,
        "",
        undefined,
        undefined as any,
      ),
    );

    // For settings, we need to dispatch loadSettings to properly populate
    // the Redux store AND window.MetabaseBootstrap
    dispatch(loadSettings(authState.siteSettings));
    MetabaseSettings.setAll(authState.siteSettings);

    // Create a fake fulfilled action result for consistency
    siteSettings = {
      payload: authState.siteSettings,
      type: refreshSiteSettings.fulfilled.type,
      meta: {} as any,
    };
  } else {
    console.log(
      "[bundle] Fetching user and site settings (no prefetch available)",
    );
    [user, siteSettings] = await Promise.all([
      dispatch(refreshCurrentUser()),
      dispatch(refreshSiteSettings()),
    ]);
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
};

const refreshTokenImpl = async (
  {
    metabaseInstanceUrl,
    preferredAuthMethod,
    jwtProviderUri,
  }: {
    metabaseInstanceUrl: string;
    preferredAuthMethod?: MetabaseAuthConfig["preferredAuthMethod"];
    jwtProviderUri?: string;
  },
  { getState }: { getState: () => unknown },
): Promise<MetabaseEmbeddingSessionToken | null> => {
  const state = getState() as SdkStoreState;

  if (EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSimpleEmbedding) {
    return requestSessionTokenFromEmbedJs();
  }

  const customGetRefreshToken = getFetchRefreshTokenFn(state) ?? undefined;

  const session = await getRefreshToken({
    metabaseInstanceUrl,
    preferredAuthMethod,
    jwtProviderUri,
    fetchRequestToken: customGetRefreshToken,
  });
  validateSession(session);

  return session;
};

// Thunk used locally in this file, NOT exported
const refreshTokenAsync = createAsyncThunk(
  "sdk/token/REFRESH_TOKEN",
  refreshTokenImpl,
);

// implementation used by the OSS thunk wrapper
PLUGIN_EMBEDDING_SDK_AUTH.refreshTokenAsync = refreshTokenImpl;

export const getOrRefreshSession = createAsyncThunk(
  GET_OR_REFRESH_SESSION,
  async (
    authConfig: {
      metabaseInstanceUrl: string;
      preferredAuthMethod?: MetabaseAuthConfig["preferredAuthMethod"];
      jwtProviderUri?: string;
    },
    { dispatch, getState },
  ) => {
    // necessary to ensure that we don't use a popup every time the user
    // refreshes the page
    const storedAuthToken = samlTokenStorage.get();
    const state = getSessionTokenState(getState() as SdkStoreState);
    /**
     * @see {@link https://github.com/metabase/metabase/pull/64238#discussion_r2394229266}
     *
     * TODO: I think this should be called session overall e.g. state.session
     */
    const session = storedAuthToken ?? state?.token;

    const shouldRefreshToken =
      !session ||
      (typeof session?.exp === "number" && session.exp * 1000 < Date.now());
    if (!shouldRefreshToken) {
      return session;
    }

    if (refreshTokenPromise) {
      return refreshTokenPromise.unwrap();
    }

    refreshTokenPromise = dispatch(refreshTokenAsync(authConfig));
    refreshTokenPromise.finally(() => {
      refreshTokenPromise = null;
    });

    return refreshTokenPromise.unwrap();
  },
);

const getRefreshToken = async ({
  metabaseInstanceUrl,
  preferredAuthMethod,
  fetchRequestToken: customGetRequestToken,
  jwtProviderUri,
}: {
  metabaseInstanceUrl: string;
  preferredAuthMethod?: MetabaseAuthConfig["preferredAuthMethod"];
  fetchRequestToken?: MetabaseAuthConfig["fetchRequestToken"];
  jwtProviderUri?: string;
}) => {
  // Check if the package has already started JWT auth (JWT only, not SAML)
  if (preferredAuthMethod === "jwt") {
    const authState = readAuthState();
    console.log("[bundle] Checking package auth state:", authState.status);

    // If package started auth, wait for it to complete
    if (authState.status === "in-progress") {
      console.log("[bundle] Package auth in progress, waiting...");
      await waitForAuthCompletion();
      const completedState = readAuthState();

      if (completedState.session) {
        console.log("[bundle] Using session from package auth");
        return completedState.session;
      }

      // If we got here, auth completed but without a session (shouldn't happen)
      throw (
        completedState.error ||
        new Error("Auth completed without session or error")
      );
    }

    // If package already completed auth, use the cached session
    if (authState.status === "completed" && authState.session) {
      console.log("[bundle] Using cached session from package auth");
      return authState.session;
    }

    // If package encountered an error, throw it
    if (authState.status === "error") {
      console.error("[bundle] Package auth had an error, rethrowing");
      throw authState.error || new Error("Auth failed with unknown error");
    }

    // Otherwise, authState.status === "idle", so proceed with normal flow
    // This happens when using an old SDK package that doesn't have early auth
    console.log(
      "[bundle] Package auth not started (status: idle), proceeding with bundle auth",
    );
  }

  const shouldSkipSsoDiscovery =
    preferredAuthMethod === "jwt" && Boolean(jwtProviderUri);

  const urlResponseJson = shouldSkipSsoDiscovery
    ? { method: "jwt", url: jwtProviderUri }
    : await connectToInstanceAuthSso(metabaseInstanceUrl, {
        preferredAuthMethod,
        headers: getSdkRequestHeaders(),
      });

  const { method, url: responseUrl, hash } = urlResponseJson || {};
  if (method === "saml") {
    const token = await openSamlLoginPopup(responseUrl);
    samlTokenStorage.set(token);

    return token;
  }
  if (method === "jwt" && responseUrl) {
    return jwtDefaultRefreshTokenFunction(
      responseUrl,
      metabaseInstanceUrl,
      getSdkRequestHeaders(hash),
      customGetRequestToken,
    );
  }
  if (method === "jwt") {
    throw MetabaseError.CANNOT_CONNECT_TO_INSTANCE({
      instanceUrl: metabaseInstanceUrl,
      message: "Missing JWT provider URI",
    });
  }
  throw MetabaseError.INVALID_AUTH_METHOD({ method });
};

function getSdkRequestHeaders(hash?: string): Record<string, string> {
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
