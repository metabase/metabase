import type { UpgradeHealth, UpgradeResponse } from "metabase-types/api";

import { Api } from "./api";

// Passed as fixedCacheKey so the trigger and the status pages share one mutation result.
export const SELF_UPGRADE_CACHE_KEY = "self-upgrade";

export const upgradeApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    // The request blocks while the server downloads the new jar and then exits,
    // so the connection is expected to drop: never retry or emit auth events.
    startUpgrade: builder.mutation<UpgradeResponse, void>({
      query: () => ({
        method: "POST",
        url: "/api/upgrade",
      }),
      extraOptions: { retry: false, noEvent: true },
    }),
    getUpgradeHealth: builder.query<UpgradeHealth, void>({
      query: () => "/api/upgrade/health",
      extraOptions: { retry: false, noEvent: true },
    }),
  }),
});

export const { useStartUpgradeMutation, useGetUpgradeHealthQuery } = upgradeApi;
