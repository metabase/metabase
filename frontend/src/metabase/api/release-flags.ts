import type { ReleaseFlag, ReleaseFlagMap } from "metabase-types/api";

import { Api } from "./api";

type SetReleaseFlagRequest = {
  name: ReleaseFlag;
  value: boolean;
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
      query: ({ name, value }) => ({
        method: "PUT",
        url: `/api/release-flag`,
        body: JSON.stringify({ name, value }),
      }),
      invalidatesTags: () => ["release-flags"],
    }),
  }),
});

export const { useGetReleaseFlagsQuery, useSetReleaseFlagMutation } =
  releaseFlagsApi;
