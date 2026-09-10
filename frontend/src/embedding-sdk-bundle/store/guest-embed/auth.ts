// This file reflects the structure in enterprise/frontend/src/embedding-sdk-ee/auth/auth.ts
import type { AsyncThunkAction, SerializedError } from "@reduxjs/toolkit";
import { createAction } from "@reduxjs/toolkit";

import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";
import { requestSessionTokenFromEmbedJs } from "metabase/embedding/embedding-iframe-sdk/utils/request-session-token";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";
import { createAsyncThunk } from "metabase/redux/utils";
import { decodeJwt } from "metabase/utils/jwt";

import { getSessionTokenState } from "../selectors";

let refreshGuestSessionPromise: ReturnType<
  AsyncThunkAction<string | null, unknown, any>
> | null = null;

// Sets the initial guest embed token when a component first loads. Keyed by a
// stable per-mount id so concurrent guest embeds under one
// MetabaseProvider don't overwrite each other's token.
export const setInitialGuestToken = createAction<{
  mountId: string;
  token: string;
}>("sdk/guest-embed/SET_INITIAL_TOKEN");

// Drops a mount's guest token when it unmounts, so a remounted embed (the
// iframe route re-keys its children when the token changes) doesn't leave a
// stale entry behind for getOrRefreshGuestSession to pick up.
export const clearGuestToken = createAction<string>(
  "sdk/guest-embed/CLEAR_TOKEN",
);

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
    authConfig: MetabaseAuthConfig;
    expiredToken: string;
    // Unused by the fetch itself; carried on the thunk arg so the reducer can
    // write the refreshed token back to the same guestTokensByMount key.
    mountId: string;
  }): Promise<string> => {
    if (authConfig.isGuest && !authConfig.guestEmbedProviderUri) {
      throw new Error(
        "guestEmbedProviderUri is required to refresh the guest embed token",
      );
    }

    if (isEmbeddingEajs()) {
      return await requestSessionTokenFromEmbedJs({ expiredToken });
    }

    throw new Error(
      "Guest embed token refresh is only supported in iframe embeds",
    );
  },
);

// Unlike the SSO counterpart, returns the raw JWT string, not the decoded session object.
export const getOrRefreshGuestSession = createAsyncThunk(
  "sdk/guest-embed/GET_OR_REFRESH_TOKEN",
  async (authConfig: MetabaseAuthConfig, { dispatch, getState }) => {
    // Unjustified type cast. FIXME
    const state = getState() as SdkStoreState;
    const tokenState = getSessionTokenState(state);
    // This thunk only runs for iframe/modular embeds (see the isEmbeddingEajs
    // check below), where each embed gets its own iframe and therefore its
    // own store, and each mount drops its entry on unmount — so there's only
    // ever one guest token in this map.
    // Needs rework for EMB-2295 (guestEmbedProviderUri in the plain SDK): there
    // one store can hold several mounts, and picking an arbitrary key would
    // hand every request the same token again.
    const mountId = Object.keys(tokenState.guestTokensByMount)[0];
    const currentToken = mountId
      ? tokenState.guestTokensByMount[mountId]
      : null;

    // No token in Redux yet, so we can't check expiration.
    if (!currentToken) {
      return null;
    }

    const session = decodeJwt(currentToken);

    /**
     * Cypress can't mock time inside an iframe, so we support a window flag
     * that forces a token refresh for testing purposes.
     *
     * We also, couldn't check window.CYPRESS because that only exists in the parent window.
     */
    let forceRefreshForCypress;
    if (typeof window !== "undefined") {
      forceRefreshForCypress =
        window.FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS === true;
    }
    if (forceRefreshForCypress) {
      window.FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS = false;
    }

    const shouldRefreshToken =
      forceRefreshForCypress ||
      !session ||
      (typeof session?.exp === "number" && session.exp * 1000 < Date.now());

    if (!shouldRefreshToken) {
      return currentToken;
    }

    if (refreshGuestSessionPromise) {
      return refreshGuestSessionPromise.unwrap();
    }

    refreshGuestSessionPromise = dispatch(
      refreshGuestSession({
        authConfig,
        expiredToken: currentToken,
        mountId,
      }),
    );

    refreshGuestSessionPromise.finally(() => {
      refreshGuestSessionPromise = null;
    });

    return refreshGuestSessionPromise.unwrap();
  },
);
