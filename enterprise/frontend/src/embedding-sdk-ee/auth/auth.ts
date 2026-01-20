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
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { SdkAuthState } from "embedding-sdk-shared/types/auth-state";
import { SDK_AUTH_STATE_KEY } from "embedding-sdk-shared/types/auth-state";
import { requestSessionTokenFromEmbedJs } from "metabase/embedding/embedding-iframe-sdk/utils";
import {
  EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG,
  isEmbeddingEajs,
} from "metabase/embedding-sdk/config";
import { samlTokenStorage } from "metabase/embedding-sdk/lib/saml-token-storage";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import api from "metabase/lib/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { loadSettings, refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import type { User } from "metabase-types/api";

const GET_OR_REFRESH_SESSION = "sdk/token/GET_OR_REFRESH_SESSION";

let refreshTokenPromise: ReturnType<
  AsyncThunkAction<MetabaseEmbeddingSessionToken | null, unknown, any>
> | null = null;

// Side effect happening here.
console.log("THIS SHOULD BE CALLED");
PLUGIN_EMBEDDING_SDK_AUTH.initAuth = async (
  authConfig: MetabaseAuthConfig & { isLocalHost?: boolean },
  { dispatch }: { dispatch: SdkDispatch },
) => {
  const { metabaseInstanceUrl, preferredAuthMethod, apiKey, isLocalHost } =
    authConfig;

  // This is needed because of how MetabaseAuthConfig is typed
  const jwtProviderUri =
    "jwtProviderUri" in authConfig ? authConfig.jwtProviderUri : undefined;

  // remove any stale tokens that might be there from a previous session=
  samlTokenStorage.remove();

  console.log({
    authConfig,
    getAuthState: JSON.parse(JSON.stringify(getAuthState())),
  });
  // Check if we can use the auth pre-fetched by the package
  if (
    "jwtProviderUri" in authConfig &&
    authConfig.jwtProviderUri &&
    getAuthState()?.status
  ) {
    console.log("WaitForAuthCompletion");
    await waitForAuthCompletion();
    console.log("WaitForAuthCompletion done");
    const authState = getAuthState() as SdkAuthState;
    if (
      authState.status === "completed" &&
      authState.session &&
      authState.user &&
      authState.siteSettings
    ) {
      (window as any).api = api;
      api.sessionToken = authState.session.id;
      dispatch(refreshCurrentUser.fulfilled(authState.user, "", undefined));
      dispatch(loadSettings(authState.siteSettings as any));

      console.log("INITH AUTH Auth is completed and the data is available");
      return; // nothing else to do
    } else {
      throw new Error("Auth is not completed or the data is not available");
      console.log({ authState });
    }
    // if we get here, the auth is not completed or the data is not available
    // so we fallback to the standard auth flow
  }

  return; // it should be handled above

  // Setup JWT or API key
  const isValidInstanceUrl =
    metabaseInstanceUrl && metabaseInstanceUrl?.length > 0;
  const isValidApiKeyConfig = apiKey && (isLocalHost || getIsLocalhost());

  if (isValidApiKeyConfig) {
    // API key setup
    api.apiKey = apiKey!;
  } else if (EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.useExistingUserSession) {
    // Use existing user session. Do nothing.
  } else if (isValidInstanceUrl) {
    // SSO setup
    PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.getOrRefreshSessionHandler =
      async () => {
        const session = await dispatch(
          getOrRefreshSession(authConfig),
        ).unwrap();
        if (session?.id) {
          api.sessionToken = session.id;
        }
      };
    try {
      // verify that the session is actually valid before proceeding
      await dispatch(getOrRefreshSession(authConfig)).unwrap();
    } catch (e) {
      // TODO: Fix this. For some reason the instanceof check keeps returning `false`. I'd rather not do this
      // but due to time constraints this is what we have to do to make sure tests pass.
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- error checking for better errors. should be improved in the future.
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
};

const refreshTokenImpl = async (
  config: MetabaseAuthConfig,
  { getState }: { getState: () => unknown },
): Promise<MetabaseEmbeddingSessionToken | null> => {
  const state = getState() as SdkStoreState;

  if (isEmbeddingEajs()) {
    return requestSessionTokenFromEmbedJs();
  }

  const customGetRefreshToken = getFetchRefreshTokenFn(state) ?? undefined;

  const session = await getRefreshToken({
    ...config,
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
  async (authConfig: MetabaseAuthConfig, { dispatch, getState }) => {
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
  jwtProviderUri,
  fetchRequestToken: customGetRequestToken,
}: Pick<
  MetabaseAuthConfig,
  "metabaseInstanceUrl" | "fetchRequestToken" | "preferredAuthMethod"
> & { jwtProviderUri?: string }) => {
  // If jwtProviderUri is provided, skip discovery
  if (jwtProviderUri) {
    return jwtDefaultRefreshTokenFunction(
      jwtProviderUri,
      metabaseInstanceUrl,
      getSdkRequestHeaders(),
      customGetRequestToken,
    );
  }

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
  if (method === "jwt" && responseUrl) {
    return jwtDefaultRefreshTokenFunction(
      responseUrl,
      metabaseInstanceUrl,
      getSdkRequestHeaders(hash),
      customGetRequestToken,
    );
  }
  throw MetabaseError.INVALID_AUTH_METHOD({ method });
};

function getSdkRequestHeaders(hash?: string): Record<string, string> {
  return {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
    "X-Metabase-Client": "embedding-sdk-react",
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
    "X-Metabase-Client-Version":
      getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO").version ??
      EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION,
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
    ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
  };
}

function getAuthState(): SdkAuthState | undefined {
  return getWindow()?.[SDK_AUTH_STATE_KEY];
}

/**
 * Wait for the package's auth to complete.
 * Polls the window state until it's no longer "in-progress".
 */
async function waitForAuthCompletion(
  timeoutMs: number = 30000,
): Promise<SdkAuthState> {
  // early return if already completed
  if (getAuthState()?.status !== "in-progress") {
    return getAuthState() as SdkAuthState;
  }
  const startTime = Date.now();
  const pollInterval = 10;

  return new Promise((resolve, reject) => {
    const check = () => {
      const state = getAuthState();
      if (state?.status !== "in-progress") {
        resolve(state ?? { status: "idle" });
        return;
      }
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error("Timeout waiting for early auth to complete"));
        return;
      }
      setTimeout(check, pollInterval);
    };
    check();
  });
}
