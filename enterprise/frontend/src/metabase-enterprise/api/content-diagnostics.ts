import type {
  InvalidateFindingsRequest,
  InvalidateFindingsResponse,
  ListDuplicatedFindingsRequest,
  ListDuplicatedFindingsResponse,
  ListImbalancedFindingsRequest,
  ListImbalancedFindingsResponse,
  ListSlowFindingsRequest,
  ListSlowFindingsResponse,
  ListStaleFindingsRequest,
  ListStaleFindingsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag } from "./tags";

const findingsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listStaleFindings: builder.query<
      ListStaleFindingsResponse,
      ListStaleFindingsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/content-diagnostics/stale",
        params,
      }),
      providesTags: () => [listTag("content-diagnostics-finding")],
    }),
    listSlowFindings: builder.query<
      ListSlowFindingsResponse,
      ListSlowFindingsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/content-diagnostics/slow",
        params,
      }),
      providesTags: () => [listTag("content-diagnostics-finding")],
    }),
    listDuplicatedFindings: builder.query<
      ListDuplicatedFindingsResponse,
      ListDuplicatedFindingsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/content-diagnostics/duplicated",
        params,
      }),
      providesTags: () => [listTag("content-diagnostics-finding")],
    }),
    listImbalancedFindings: builder.query<
      ListImbalancedFindingsResponse,
      ListImbalancedFindingsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/content-diagnostics/imbalanced",
        params,
      }),
      providesTags: () => [listTag("content-diagnostics-finding")],
    }),
  }),
});

const findingEndpoints = [
  "listStaleFindings",
  "listSlowFindings",
  "listDuplicatedFindings",
  "listImbalancedFindings",
] as const;

export const contentDiagnosticsApi = findingsApi.injectEndpoints({
  endpoints: (builder) => ({
    invalidateFindings: builder.mutation<
      InvalidateFindingsResponse,
      InvalidateFindingsRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/content-diagnostics/invalidate",
        body,
      }),
      async onQueryStarted({ ids }, { dispatch, getState, queryFulfilled }) {
        const findingIds = new Set(ids);
        // The mutation and cache selector use the same Redux store.
        const state = getState() as Parameters<
          typeof findingsApi.util.selectCachedArgsForQuery
        >[0];
        const patches = findingEndpoints.flatMap((endpoint) =>
          findingsApi.util
            .selectCachedArgsForQuery(state, endpoint)
            .map((args) =>
              dispatch(
                findingsApi.util.updateQueryData(endpoint, args, (draft) => {
                  for (let index = draft.data.length - 1; index >= 0; index--) {
                    if (findingIds.has(draft.data[index].id)) {
                      draft.data.splice(index, 1);
                    }
                  }
                  // Wait for the server's total before changing pages,
                  // so a failed dismissal doesn't lose the selection.
                }),
              ),
            ),
        );
        try {
          await queryFulfilled;
        } catch {
          patches.forEach((patch) => patch.undo());
          // Refetch in case another request changed the cache
          // or the server saved only part of the batch.
          dispatch(
            findingsApi.util.invalidateTags([
              listTag("content-diagnostics-finding"),
            ]),
          );
        }
      },
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("content-diagnostics-finding")]),
    }),
  }),
});

export const {
  useInvalidateFindingsMutation,
  useListStaleFindingsQuery,
  useListSlowFindingsQuery,
  useListDuplicatedFindingsQuery,
  useListImbalancedFindingsQuery,
} = contentDiagnosticsApi;
