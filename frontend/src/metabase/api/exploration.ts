import type {
  CancelExplorationThreadRequest,
  CancelExplorationThreadResponse,
  CreateExplorationRequest,
  Dataset,
  Exploration,
  ExplorationId,
  ExplorationQueryId,
  ExploreFurtherRequest,
  GetExplorationDataRequest,
  GetExplorationDataResponse,
  GetMyExplorationsRequest,
  GetMyExplorationsResponse,
  RestartExplorationThreadRequest,
  UpdateExplorationRequest,
} from "metabase-types/api";
import { getExplorationPages } from "metabase-types/api/exploration";

import { Api } from "./api";
import { idTag, invalidateTags, listTag, provideMetricTags } from "./tags";

export const explorationApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getExplorationData: builder.query<
      GetExplorationDataResponse,
      GetExplorationDataRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/exploration/dimensions",
        params,
      }),
      providesTags: (response) =>
        (response?.metrics ?? []).flatMap(provideMetricTags),
    }),
    getExploration: builder.query<Exploration, ExplorationId>({
      query: (id) => ({
        method: "GET",
        url: `/api/exploration/${id}`,
      }),
      providesTags: (exploration) =>
        exploration ? [idTag("exploration", exploration.id)] : [],
    }),
    getMyExplorations: builder.query<
      GetMyExplorationsResponse,
      GetMyExplorationsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/exploration/mine",
        params,
      }),
      providesTags: () => [listTag("exploration")],
    }),
    createExploration: builder.mutation<Exploration, CreateExplorationRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/exploration",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("exploration")]),
    }),
    updateExploration: builder.mutation<Exploration, UpdateExplorationRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/exploration/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          idTag("exploration", id),
          listTag("exploration"),
        ]),
    }),
    exploreFurther: builder.mutation<Exploration, ExploreFurtherRequest>({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/exploration/${id}/explore-further`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("exploration", id)]),
    }),
    deleteExploration: builder.mutation<void, ExplorationId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/exploration/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("exploration", id),
          listTag("exploration"),
        ]),
    }),
    restartExplorationThread: builder.mutation<
      Exploration,
      RestartExplorationThreadRequest
    >({
      query: ({ threadId }) => ({
        method: "POST",
        url: `/api/exploration/thread/${threadId}/restart`,
      }),
      invalidatesTags: (_, error, { explorationId }) =>
        invalidateTags(error, [idTag("exploration", explorationId)]),
    }),
    cancelExplorationThread: builder.mutation<
      CancelExplorationThreadResponse,
      CancelExplorationThreadRequest
    >({
      query: ({ threadId }) => ({
        method: "POST",
        url: `/api/exploration/thread/${threadId}/cancel`,
      }),
      invalidatesTags: (_, error, { explorationId }) =>
        invalidateTags(error, [idTag("exploration", explorationId)]),
    }),
    getExplorationQueryResult: builder.query<Dataset, ExplorationQueryId>({
      query: (id) => ({
        method: "GET",
        url: `/api/exploration/query/${id}`,
      }),
      // Hold each query's result in the cache for 30 minutes after the last
      // subscriber unmounts so that flipping between previously-viewed queries
      // inside one session is instant (no skeleton flash on re-select).
      keepUnusedDataFor: 30 * 60,
    }),
    setPageStarred: builder.mutation<
      void,
      { pageId: number; explorationId: ExplorationId; starred: boolean }
    >({
      query: ({ pageId, starred }) => ({
        method: "PUT",
        url: `/api/exploration/page/${pageId}/starred`,
        body: { starred },
      }),
      async onQueryStarted(
        { pageId, explorationId, starred },
        { dispatch, queryFulfilled },
      ) {
        const patchResult = dispatch(
          explorationApi.util.updateQueryData(
            "getExploration",
            explorationId,
            (draft) => {
              // casting as Exploration prevents excessively deep type error
              const page = getExplorationPages(draft as Exploration).find(
                (page) => page.id === pageId,
              );
              if (page) {
                page.starred = starred;
              }
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
    setPagesHidden: builder.mutation<
      void,
      { pageIds: number[]; explorationId: ExplorationId; hidden: boolean }
    >({
      query: ({ pageIds, hidden }) => ({
        method: "PUT",
        url: `/api/exploration/pages/hidden`,
        body: { page_ids: pageIds, hidden },
      }),
      async onQueryStarted(
        { pageIds, explorationId, hidden },
        { dispatch, queryFulfilled },
      ) {
        const hiddenPageIds = new Set(pageIds);
        const patchResult = dispatch(
          explorationApi.util.updateQueryData(
            "getExploration",
            explorationId,
            (draft) => {
              // casting as Exploration prevents excessively deep type error
              for (const page of getExplorationPages(draft as Exploration)) {
                if (hiddenPageIds.has(page.id)) {
                  page.hidden = hidden;
                }
              }
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
  }),
});

export const {
  useGetExplorationDataQuery,
  useGetExplorationQuery,
  useGetMyExplorationsQuery,
  useCreateExplorationMutation,
  useExploreFurtherMutation,
  useUpdateExplorationMutation,
  useDeleteExplorationMutation,
  useRestartExplorationThreadMutation,
  useCancelExplorationThreadMutation,
  useSetPageStarredMutation,
  useSetPagesHiddenMutation,
} = explorationApi;
