import { setReleaseFlags } from "metabase/lib/release-flags";
import type { ReleaseFlag, ReleaseFlagMap } from "metabase-types/api";

import { Api } from "./api";

type SetReleaseFlagRequest = Record<ReleaseFlag, boolean>;

export const releaseFlagsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getReleaseFlags: builder.query<ReleaseFlagMap, void>({
      query: () => ({
        method: "GET",
        url: "/api/release-flags",
      }),
      providesTags: ["release-flags"],
      onQueryStarted: async (_, { queryFulfilled }) => {
        const response = await queryFulfilled;
        if (response.data) {
          const simpleMap = Object.fromEntries(
            Object.entries(response.data).map(([key, { is_enabled }]) => [
              key,
              Boolean(is_enabled),
            ]),
          ) as Record<ReleaseFlag, boolean>;
          setReleaseFlags(simpleMap);
        }
      },
    }),
    setReleaseFlag: builder.mutation<ReleaseFlagMap, SetReleaseFlagRequest>({
      query: (payload: SetReleaseFlagRequest) => ({
        method: "PUT",
        url: `/api/release-flags`,
        body: payload,
      }),
      invalidatesTags: () => ["release-flags"],
    }),
  }),
});

export const { useGetReleaseFlagsQuery, useSetReleaseFlagMutation } =
  releaseFlagsApi;
