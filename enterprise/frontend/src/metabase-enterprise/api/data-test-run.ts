import type {
  DataTestRunDetail,
  DataTestRunId,
  ListDataTestRunsRequest,
  ListDataTestRunsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { provideDataTestRunListTags, provideDataTestRunTags } from "./tags";

export const dataTestRunApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listDataTestRuns: builder.query<
      ListDataTestRunsResponse,
      ListDataTestRunsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/data-test-run",
        params,
      }),
      providesTags: (response) =>
        provideDataTestRunListTags(response?.data ?? []),
    }),
    getDataTestRun: builder.query<DataTestRunDetail, DataTestRunId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/data-test-run/${id}`,
      }),
      providesTags: (run) => (run ? provideDataTestRunTags(run) : []),
    }),
  }),
});

export const { useListDataTestRunsQuery, useGetDataTestRunQuery } =
  dataTestRunApi;
