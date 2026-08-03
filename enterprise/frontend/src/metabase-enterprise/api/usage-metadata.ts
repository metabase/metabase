import type {
  CreateUsageMetadataCandidateRequest,
  CreateUsageMetadataCandidateResponse,
  DismissUsageMetadataCandidateRequest,
  ListUsageMetadataRequest,
  StartUsageMetadataRefreshResponse,
  UsageMetadataCandidateDetail,
  UsageMetadataCandidateSummary,
  UsageMetadataPage,
  UsageMetadataRefreshStatus,
  UsageMetadataTableDetail,
  UsageMetadataTableSummary,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag, tag } from "./tags";

const BASE_URL = "/api/ee/data-studio/usage-metadata";
const LIST_PAGE_SIZE = 200;

type UsageMetadataListQuery = {
  method: "GET";
  url: string;
  params: ListUsageMetadataRequest;
};

type UsageMetadataListResult = {
  data?: unknown;
  error?: unknown;
};

async function listAllUsageMetadataPages<T>(
  baseQuery: (
    query: UsageMetadataListQuery,
  ) => UsageMetadataListResult | PromiseLike<UsageMetadataListResult>,
  url: string,
  params: ListUsageMetadataRequest,
) {
  const { limit: _limit, offset: _offset, ...filters } = params;
  const fetchPage = (offset: number) =>
    baseQuery({
      method: "GET",
      url,
      params: {
        ...filters,
        limit: LIST_PAGE_SIZE,
        offset,
      },
    });

  const firstResult = await fetchPage(0);
  if (firstResult.error != null) {
    return { error: firstResult.error };
  }

  // RTK's base query returns unknown because it serves every API endpoint;
  // this helper is only called with usage-metadata list endpoints.
  const firstPage = firstResult.data as UsageMetadataPage<T>;
  const remainingPageCount = Math.max(
    0,
    Math.ceil(firstPage.total / LIST_PAGE_SIZE) - 1,
  );
  const remainingResults = await Promise.all(
    Array.from({ length: remainingPageCount }, (_, index) =>
      fetchPage((index + 1) * LIST_PAGE_SIZE),
    ),
  );

  const pages = [firstPage];
  for (const result of remainingResults) {
    if (result.error != null) {
      return { error: result.error };
    }

    // See the RTK base-query type note above.
    const page = result.data as UsageMetadataPage<T>;
    if (page.snapshot?.id !== firstPage.snapshot?.id) {
      return {
        error: new Error(
          "The usage metadata snapshot changed while loading the list",
        ),
      };
    }
    pages.push(page);
  }

  return {
    data: {
      ...firstPage,
      data: pages.flatMap((page) => page.data),
      limit: null,
      offset: null,
    },
  };
}

export const usageMetadataApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listUsageMetadataTables: builder.query<
      UsageMetadataPage<UsageMetadataTableSummary>,
      ListUsageMetadataRequest
    >({
      queryFn: (params, _api, _options, baseQuery) =>
        listAllUsageMetadataPages<UsageMetadataTableSummary>(
          baseQuery,
          `${BASE_URL}/tables`,
          params,
        ),
      providesTags: [listTag("usage-metadata-candidate")],
    }),
    getUsageMetadataTable: builder.query<UsageMetadataTableDetail, number>({
      query: (id) => ({
        method: "GET",
        url: `${BASE_URL}/tables/${id}`,
      }),
      providesTags: (_response, _error, id) => [
        idTag("usage-metadata-candidate", `table-${id}`),
      ],
    }),
    listUsageMetadataCandidates: builder.query<
      UsageMetadataPage<UsageMetadataCandidateSummary>,
      ListUsageMetadataRequest
    >({
      queryFn: (params, _api, _options, baseQuery) =>
        listAllUsageMetadataPages<UsageMetadataCandidateSummary>(
          baseQuery,
          `${BASE_URL}/candidates`,
          params,
        ),
      providesTags: (response) => [
        listTag("usage-metadata-candidate"),
        ...(response?.data.map((candidate) =>
          idTag("usage-metadata-candidate", candidate.id),
        ) ?? []),
      ],
    }),
    getUsageMetadataCandidate: builder.query<
      UsageMetadataCandidateDetail,
      number
    >({
      query: (id) => ({
        method: "GET",
        url: `${BASE_URL}/candidates/${id}`,
      }),
      providesTags: (_response, _error, id) => [
        idTag("usage-metadata-candidate", id),
      ],
    }),
    dismissUsageMetadataCandidate: builder.mutation<
      UsageMetadataCandidateDetail,
      DismissUsageMetadataCandidateRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `${BASE_URL}/candidates/${id}/dismiss`,
        body,
      }),
      invalidatesTags: (response, error, { id }) =>
        invalidateTags(error, [
          idTag("usage-metadata-candidate", id),
          listTag("usage-metadata-candidate"),
          ...(response
            ? [idTag("usage-metadata-candidate", `table-${response.table.id}`)]
            : []),
        ]),
    }),
    restoreUsageMetadataCandidate: builder.mutation<
      UsageMetadataCandidateDetail,
      number
    >({
      query: (id) => ({
        method: "DELETE",
        url: `${BASE_URL}/candidates/${id}/dismissal`,
      }),
      invalidatesTags: (response, error, id) =>
        invalidateTags(error, [
          idTag("usage-metadata-candidate", id),
          listTag("usage-metadata-candidate"),
          ...(response
            ? [idTag("usage-metadata-candidate", `table-${response.table.id}`)]
            : []),
        ]),
    }),
    createUsageMetadataCandidate: builder.mutation<
      CreateUsageMetadataCandidateResponse,
      CreateUsageMetadataCandidateRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `${BASE_URL}/candidates/${id}/create`,
        body,
      }),
      invalidatesTags: (response, error, { id }) =>
        invalidateTags(error, [
          idTag("usage-metadata-candidate", id),
          listTag("usage-metadata-candidate"),
          ...(response
            ? [
                idTag(
                  "usage-metadata-candidate",
                  `table-${response.candidate.table.id}`,
                ),
              ]
            : []),
        ]),
    }),
    getUsageMetadataRefreshStatus: builder.query<
      UsageMetadataRefreshStatus,
      void
    >({
      query: () => ({
        method: "GET",
        url: `${BASE_URL}/refresh`,
      }),
      providesTags: [tag("usage-metadata-refresh")],
    }),
    startUsageMetadataRefresh: builder.mutation<
      StartUsageMetadataRefreshResponse,
      void
    >({
      query: () => ({
        method: "POST",
        url: `${BASE_URL}/refresh`,
      }),
      invalidatesTags: (_response, error) =>
        invalidateTags(error, [tag("usage-metadata-refresh")]),
    }),
  }),
});

export const {
  useListUsageMetadataTablesQuery,
  useGetUsageMetadataTableQuery,
  useListUsageMetadataCandidatesQuery,
  useGetUsageMetadataCandidateQuery,
  useDismissUsageMetadataCandidateMutation,
  useRestoreUsageMetadataCandidateMutation,
  useCreateUsageMetadataCandidateMutation,
  useGetUsageMetadataRefreshStatusQuery,
  useStartUsageMetadataRefreshMutation,
} = usageMetadataApi;
