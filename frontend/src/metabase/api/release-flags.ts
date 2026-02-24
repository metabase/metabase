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
