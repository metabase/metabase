// This file reflects the structure in enterprise/frontend/src/embedding-sdk-ee/auth/auth.ts
import type { AsyncThunkAction, SerializedError } from "@reduxjs/toolkit";
import { createAction } from "@reduxjs/toolkit";

import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { requestSessionTokenFromEmbedJs } from "metabase/embedding/embedding-iframe-sdk/utils/request-session-token";
import { isWithinIframe } from "metabase/lib/dom";
import { decodeJwt } from "metabase/lib/jwt";
import { createAsyncThunk } from "metabase/lib/redux";

import { getSessionTokenState } from "../selectors";

// Module-level promise for preventing concurrent refreshes
let refreshGuestSessionPromise: ReturnType<
  AsyncThunkAction<string | null, unknown, any>
> | null = null;

/**
 * Sets the initial guest embed token when a component first loads.
 * This is different from refreshing - it stores the token that was
 * passed as a prop to the dashboard or question component.
 */
export const setInitialGuestToken = createAction<string>(
  "sdk/guest-embed/SET_INITIAL_TOKEN",
);

/**
 * Records a token fetch error so dashboard/question components can display it
 * via the existing tokenFetchError path, even before the component has mounted.
 */
export const setGuestTokenFetchError = createAction<SerializedError | null>(
  "sdk/guest-embed/SET_TOKEN_FETCH_ERROR",
);

/**
 * Fetches a new guest embed token from the configured refresh endpoint.
 * For iframe embeds, delegates to embed.js via postMessage (CSP-safe).
 * Returns the raw JWT string.
 */
export const refreshGuestSession = createAsyncThunk(
  "sdk/guest-embed/REFRESH_SESSION",
  async ({
    authConfig,
    expiredToken,
  }: {
    authConfig: MetabaseAuthConfig & { guestEmbedProviderUri?: string };
    expiredToken: string;
  }): Promise<string> => {
    if (!authConfig.guestEmbedProviderUri) {
      throw new Error(
        "guestEmbedProviderUri is required for guest embed token refresh",
      );
    }

    // For iframe embeds, delegate refresh to embed.js (avoids CSP)
    if (!isWithinIframe()) {
      throw new Error(
        "Guest embed token refresh is only supported in iframe embeds",
      );
    }

    const token = await requestSessionTokenFromEmbedJs({ expiredToken });
    return token;
  },
);

/**
 * Gets or refreshes the current guest token.
 * Unlike the SSO counterpart, returns the raw JWT string, not the decoded session object.
 */
export const getOrRefreshGuestSession = createAsyncThunk(
  "sdk/guest-embed/GET_OR_REFRESH_TOKEN",
  async (
    authConfig: MetabaseAuthConfig & { guestEmbedProviderUri?: string },
    { dispatch, getState },
  ) => {
    const state = getState() as SdkStoreState;
    const tokenState = getSessionTokenState(state);
    const currentToken = tokenState.rawToken;

    // No token in Redux yet — useEffect hasn't run. Skip; initial JWTs are rarely expired in the first load.
    if (!currentToken) {
      return null;
    }

    const session = decodeJwt(currentToken);

    // Cypress can't mock time inside an iframe, so we support a window flag
    // that forces a token refresh for testing purposes.
    let forceRefreshForCypress;
    if (typeof window !== "undefined") {
      forceRefreshForCypress =
        (window as any).FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS === true;
    }
    if (forceRefreshForCypress) {
      (window as any).FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS = false;
    }

    const shouldRefreshToken =
      forceRefreshForCypress ||
      !session ||
      (typeof session?.exp === "number" && session.exp * 1000 < Date.now());

    if (!shouldRefreshToken || !authConfig.guestEmbedProviderUri) {
      return currentToken;
    }

    if (refreshGuestSessionPromise) {
      return refreshGuestSessionPromise.unwrap();
    }

    refreshGuestSessionPromise = dispatch(
      refreshGuestSession({
        authConfig,
        expiredToken: currentToken!,
      }),
    );

    refreshGuestSessionPromise.finally(() => {
      refreshGuestSessionPromise = null;
    });

    return refreshGuestSessionPromise.unwrap();
  },
);
