import { useCallback, useEffect } from "react";

import {
  Api,
  useGetSettingsQuery,
  useRefreshTokenStatusMutation,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import type { TokenStatusFeature } from "metabase-types/api";

const REFRESH_INTERVAL = 10 * 1000; // 10 seconds

/**
 * In some circumstances, a metabase instance may have a temporary token signalling that we
 * should refresh session properties. This hook will keep refreshing the session properties
 * every 10 seconds until it gets a payload that doesn't have the refresh token feature.
 */
export function useTokenRefresh() {
  /* in order to force this hook to re-run on every request, even if the response data is the same, we can't destructure only the data prop from this hook, as is the pattern in many components */
  const res = useGetSettingsQuery();
  const dispatch = useDispatch();

  useEffect(() => {
    const tokenStatusFeatures = res?.data?.["token-status"]?.features;
    const hasRefreshToken = tokenStatusFeatures?.includes(
      "refresh-token-features",
    );

    if (hasRefreshToken) {
      const timeout = setTimeout(() => {
        dispatch(Api.util.invalidateTags(["session-properties"]));
      }, REFRESH_INTERVAL);
      return () => clearTimeout(timeout);
    }
  }, [res, dispatch]);
}

/**
 * In some circumstances, a metabase instance may expect to see a certain token feature.
 * This hook will keep refreshing the session properties every 10 seconds until it gets
 * a payload with the expected token feature.  This is logically the opposite of
 * `useTokenRefresh`.
 */
export function useTokenRefreshUntil(
  tokenFeature: TokenStatusFeature,
  {
    intervalMs = REFRESH_INTERVAL,
    skip = false,
  }: { intervalMs?: number; skip?: boolean },
) {
  /* in order to force this hook to re-run on every request, even if the response data is the same, we can't destructure only the data prop from this hook, as is the pattern in many components */
  const res = useGetSettingsQuery();
  const dispatch = useDispatch();
  const [refreshTokenStatus] = useRefreshTokenStatusMutation();

  const refreshToken = useCallback(async () => {
    // Bust the server-side cache first; the mutation's invalidatesTags will
    // also invalidate session-properties on success, but we do it in finally
    // too so the UI updates even if the request fails.
    try {
      await refreshTokenStatus().unwrap();
    } finally {
      dispatch(Api.util.invalidateTags(["session-properties"]));
    }
  }, [dispatch, refreshTokenStatus]);

  useEffect(() => {
    if (skip) {
      return;
    }

    const tokenStatusFeatures = res?.data?.["token-status"]?.features;
    const isTokenFeatureMissing = !tokenStatusFeatures?.includes(tokenFeature);

    if (isTokenFeatureMissing) {
      const timeout = setTimeout(refreshToken, intervalMs);
      return () => clearTimeout(timeout);
    }
  }, [res, dispatch, tokenFeature, intervalMs, skip, refreshToken]);
}
