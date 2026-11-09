import type {
  ListDataTestRunsRequest,
  ListDataTestRunsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { provideDataTestRunListTags } from "./tags";

export const dataTestRunApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listDataTestRuns: builder.query<
      ListDataTestRunsResponse,
      ListDataTestRunsRequest
    >({
      query: ({ id, ...params }) => ({
        method: "GET",
        url: "/api/ee/data-test-run",
        params: { "test-type": "transform", "test-id": id, ...params },
      }),
      providesTags: (response) =>
        provideDataTestRunListTags(response?.data ?? []),
    }),
  }),
});

export const { useListDataTestRunsQuery } = dataTestRunApi;
