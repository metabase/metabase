import type { AsyncThunkAction } from "@reduxjs/toolkit";
import { createAction } from "@reduxjs/toolkit";

import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { requestSessionTokenFromEmbedJs } from "metabase/embedding/embedding-iframe-sdk/utils/request-session-token";
import { isWithinIframe } from "metabase/lib/dom";
import { createAsyncThunk } from "metabase/lib/redux";
import { decodeJwt } from "metabase/lib/utils";

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
    authConfig: MetabaseAuthConfig & { guestEmbedJwtRefreshUrl?: string };
    expiredToken: string;
  }): Promise<string> => {
    if (!authConfig.guestEmbedJwtRefreshUrl) {
      throw new Error(
        "guestEmbedJwtRefreshUrl is required for guest embed token refresh",
      );
    }

    // For iframe embeds, delegate refresh to embed.js (avoids CSP)
    if (!isWithinIframe()) {
      throw new Error(
        "Guest embed token refresh is only supported in iframe embeds",
      );
    }

    const token = await requestSessionTokenFromEmbedJs({
      guestTokenRefresh: { expiredToken },
    });
    return token as string;
  },
);

/**
 * Gets the current guest embed token or refreshes if expired.
 * Prevents concurrent refresh requests.
 *
 * OPT-IN BEHAVIOR:
 * - If guestEmbedJwtRefreshUrl is NOT configured, returns current token (no refresh)
 * - If guestEmbedJwtRefreshUrl IS configured, automatically refreshes expired tokens
 * This ensures the feature is opt-in and backward compatible.
 *
 * IMPORTANT: Returns the raw JWT string (not decoded session object)
 * This is used by the API request pipeline handler.
 */
export const getOrRefreshGuestSession = createAsyncThunk(
  "sdk/guest-embed/GET_OR_REFRESH_TOKEN",
  async (
    authConfig: MetabaseAuthConfig & { guestEmbedJwtRefreshUrl?: string },
    { dispatch, getState },
  ) => {
    const state = getState() as SdkStoreState;
    const tokenState = getSessionTokenState(state);
    const currentToken = tokenState.rawToken;

    // If no token in Redux yet, skip - component uses rawToken prop via fallback.
    // This handles the initial load case where useEffect hasn't run to store the
    // token yet. It's unlikely the initial JWT is expired on first load anyway.
    if (!currentToken) {
      return null;
    }

    // Decode JWT to check expiry
    const session = decodeJwt(currentToken);

    // Check if session exists and is not expired
    const shouldRefreshToken =
      !session ||
      (typeof session?.exp === "number" && session.exp * 1000 < Date.now());

    // If token is still valid or refresh URL not configured, return current token
    if (!shouldRefreshToken || !authConfig.guestEmbedJwtRefreshUrl) {
      return currentToken;
    }

    // Wait for existing refresh
    if (refreshGuestSessionPromise) {
      return refreshGuestSessionPromise.unwrap();
    }

    // Start new refresh - PASS THE EXPIRED TOKEN
    refreshGuestSessionPromise = dispatch(
      refreshGuestSession({
        authConfig,
        expiredToken: currentToken!, // Pass expired token for validation/renewal
      }),
    );

    refreshGuestSessionPromise.finally(() => {
      refreshGuestSessionPromise = null;
    });

    return refreshGuestSessionPromise.unwrap();
  },
);
