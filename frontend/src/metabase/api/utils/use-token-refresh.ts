import { useEffect } from "react";

import { Api, useGetSettingsQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";

const REFRESH_INTERVAL = 10 * 1000; // 10 seconds

/**
 * In some circumstances, a metabase instance may have a temporary token signalling that we
 * should refresh session properties
 */
export function useTokenRefresh() {
  const res = useGetSettingsQuery(); // can't destructure so it will re-run after every refetch
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
