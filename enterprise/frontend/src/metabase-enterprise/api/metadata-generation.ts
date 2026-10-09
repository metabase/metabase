import type {
  ApplyMetadataGenerationRunRequest,
  GetMetadataGenerationSuggestionsRequest,
  ListMetadataGenerationRunsRequest,
  MetadataGenerationApplyResult,
  MetadataGenerationDecisionRequest,
  MetadataGenerationDecisionResponse,
  MetadataGenerationEstimate,
  MetadataGenerationRun,
  MetadataGenerationRunId,
  MetadataGenerationRunRequest,
  MetadataGenerationRunTable,
  MetadataGenerationSuggestion,
  MetadataGenerationSuggestionStatus,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag, tag } from "./tags";

function provideRunTags(run: MetadataGenerationRun) {
  return [idTag("metadata-generation-run", run.id)];
}

const DECISION_RULES: Record<
  MetadataGenerationDecisionRequest["decision"],
  {
    from: MetadataGenerationSuggestionStatus[];
    to: MetadataGenerationSuggestionStatus;
  }
> = {
  accept: { from: ["pending", "rejected"], to: "accepted" },
  unaccept: { from: ["accepted", "rejected"], to: "pending" },
  reject: { from: ["pending", "accepted"], to: "rejected" },
};

/** The status that `request` gives `suggestion`, by the same rules as the backend. */
export function getDecidedStatus(
  suggestion: MetadataGenerationSuggestion,
  {
    decision,
    suggestion_ids,
    table_ids,
    include_human_set,
  }: MetadataGenerationDecisionRequest,
): MetadataGenerationSuggestionStatus {
  const { from, to } = DECISION_RULES[decision];
  const isSelected = suggestion_ids
    ? suggestion_ids.includes(suggestion.id)
    : (table_ids?.includes(suggestion.table_id) ?? true) &&
      (decision === "reject" ||
        include_human_set === true ||
        suggestion.source !== "human");
  return isSelected && from.includes(suggestion.status)
    ? to
    : suggestion.status;
}

export const metadataGenerationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listMetadataGenerationRuns: builder.query<
      MetadataGenerationRun[],
      ListMetadataGenerationRunsRequest
    >({
      query: ({ database_id }) => ({
        method: "GET",
        url: "/api/ee/data-sensitivity/runs",
        params: { "database-id": database_id },
      }),
      providesTags: (runs = []) => [
        listTag("metadata-generation-run"),
        ...runs.flatMap(provideRunTags),
      ],
    }),
    getMetadataGenerationRun: builder.query<
      MetadataGenerationRun,
      MetadataGenerationRunId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/data-sensitivity/runs/${id}`,
      }),
      providesTags: (run) => (run ? provideRunTags(run) : []),
    }),
    getMetadataGenerationEstimate: builder.query<
      MetadataGenerationEstimate,
      MetadataGenerationRunRequest
    >({
      query: ({ database_id, schemas, table_ids, attributes }) => ({
        method: "GET",
        url: "/api/ee/data-sensitivity/runs/estimate",
        params: {
          "database-id": database_id,
          schemas,
          "table-ids": table_ids,
          attributes,
        },
      }),
    }),
    startMetadataGenerationRun: builder.mutation<
      MetadataGenerationRun,
      MetadataGenerationRunRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/data-sensitivity/runs",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("metadata-generation-run")]),
    }),
    cancelMetadataGenerationRun: builder.mutation<
      MetadataGenerationRun,
      MetadataGenerationRunId
    >({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/data-sensitivity/runs/${id}/cancel`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("metadata-generation-run"),
          idTag("metadata-generation-run", id),
        ]),
    }),
    retryFailedMetadataGenerationRun: builder.mutation<
      MetadataGenerationRun,
      MetadataGenerationRunId
    >({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/data-sensitivity/runs/${id}/retry-failed`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("metadata-generation-run")]),
    }),
    listMetadataGenerationRunTables: builder.query<
      MetadataGenerationRunTable[],
      MetadataGenerationRunId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/data-sensitivity/runs/${id}/tables`,
      }),
      providesTags: (_, __, id) => [idTag("metadata-generation-run", id)],
    }),
    listMetadataGenerationSuggestions: builder.query<
      MetadataGenerationSuggestion[],
      GetMetadataGenerationSuggestionsRequest
    >({
      query: ({ run_id, table_id }) => ({
        method: "GET",
        url: `/api/ee/data-sensitivity/runs/${run_id}/tables/${table_id}/suggestions`,
      }),
      providesTags: (_, __, { run_id }) => [
        idTag("metadata-generation-run", run_id),
      ],
    }),
    decideMetadataGenerationSuggestions: builder.mutation<
      MetadataGenerationDecisionResponse,
      MetadataGenerationDecisionRequest
    >({
      query: ({ run_id, ...body }) => ({
        method: "POST",
        url: `/api/ee/data-sensitivity/runs/${run_id}/decisions`,
        body,
      }),
      invalidatesTags: (_, error, { run_id }) =>
        invalidateTags(error, [idTag("metadata-generation-run", run_id)]),
      onQueryStarted: async (request, { dispatch, getState, queryFulfilled }) => {
        const patches = metadataGenerationApi.util
          .selectCachedArgsForQuery(
            getState(),
            "listMetadataGenerationSuggestions",
          )
          .filter(({ run_id }) => run_id === request.run_id)
          .map((args) =>
            dispatch(
              metadataGenerationApi.util.updateQueryData(
                "listMetadataGenerationSuggestions",
                args,
                (draft) => {
                  draft.forEach((suggestion) => {
                    suggestion.status = getDecidedStatus(suggestion, request);
                  });
                },
              ),
            ),
          );
        try {
          await queryFulfilled;
        } catch {
          patches.forEach((patch) => patch.undo());
        }
      },
    }),
    applyMetadataGenerationRun: builder.mutation<
      MetadataGenerationApplyResult,
      ApplyMetadataGenerationRunRequest
    >({
      query: ({ run_id, ...body }) => ({
        method: "POST",
        url: `/api/ee/data-sensitivity/runs/${run_id}/apply`,
        body,
      }),
      invalidatesTags: (_, error, { run_id }) =>
        invalidateTags(error, [
          idTag("metadata-generation-run", run_id),
          tag("table"),
          tag("field"),
        ]),
    }),
  }),
});

export const {
  useListMetadataGenerationRunsQuery,
  useGetMetadataGenerationRunQuery,
  useGetMetadataGenerationEstimateQuery,
  useStartMetadataGenerationRunMutation,
  useCancelMetadataGenerationRunMutation,
  useRetryFailedMetadataGenerationRunMutation,
  useListMetadataGenerationRunTablesQuery,
  useListMetadataGenerationSuggestionsQuery,
  useDecideMetadataGenerationSuggestionsMutation,
  useApplyMetadataGenerationRunMutation,
} = metadataGenerationApi;
