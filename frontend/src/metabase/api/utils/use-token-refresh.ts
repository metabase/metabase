import { useEffect } from "react";

import { Api, useGetSettingsQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";

const REFRESH_INTERVAL = 10 * 1000; // 10 seconds

/**
 * In some circumstances, a metabase instance may have a temporary token signalling that we
 * should refresh session properties. This hook will keep refreshing the session properties
 * every 10 seconds until it gets a payload that doesn't have the refresh token feature.
 */
export function useTokenRefresh() {
  /* in order to force this hook to re-run on every request, even if the response data is the same, we can't destructure only the data prop from this hook, as is the patten in many components */
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
