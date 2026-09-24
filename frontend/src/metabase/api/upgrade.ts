import { getBasename } from "metabase/utils/basename";
import type {
  UpgradeHealth,
  UpgradeOperation,
  UpgradeResponse,
} from "metabase-types/api";

import { Api } from "./api";

// Passed as fixedCacheKey so the trigger and the status pages share one mutation result.
export const SELF_UPGRADE_CACHE_KEY = "self-upgrade";

export const upgradeApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    // The request blocks while the server downloads the new jar and then exits,
    // so the connection is expected to drop: never retry or emit auth events.
    startUpgrade: builder.mutation<UpgradeResponse, UpgradeOperation>({
      query: (operation) => ({
        method: "POST",
        url:
          operation === "downgrade" ? "/api/upgrade/rollback" : "/api/upgrade",
      }),
      extraOptions: { retry: false, noEvent: true },
    }),
    getUpgradeHealth: builder.query<UpgradeHealth, void>({
      query: () => "/api/upgrade/health",
      extraOptions: { retry: false, noEvent: true },
    }),
    getRollbackAvailability: builder.query<boolean, void>({
      async queryFn(_arg, { signal }) {
        try {
          const response = await fetch(
            `${getBasename()}/api/upgrade/rollback`,
            {
              method: "HEAD",
              cache: "no-store",
              signal,
            },
          );
          if (response.status === 200 || response.status === 404) {
            return { data: response.status === 200 };
          }
          return { error: { status: response.status } };
        } catch (error) {
          return { error };
        }
      },
    }),
  }),
});

export const {
  useStartUpgradeMutation,
  useGetUpgradeHealthQuery,
  useGetRollbackAvailabilityQuery,
} = upgradeApi;
