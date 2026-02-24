import type { ReleaseFlag, ReleaseFlagMap } from "metabase-types/api";

import { Api } from "./api";

type SetReleaseFlagRequest = {
  name: ReleaseFlag;
  is_enabled: boolean;
};

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
      query: ({ name, is_enabled }) => ({
        method: "PUT",
        url: `/api/release-flags`,
        body: { name, is_enabled },
      }),
      invalidatesTags: () => ["release-flags"],
    }),
  }),
});

export const { useGetReleaseFlagsQuery, useSetReleaseFlagMutation } =
  releaseFlagsApi;
