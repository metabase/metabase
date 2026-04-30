import type {
  CreateExplorationRequest,
  Dataset,
  Exploration,
  ExplorationId,
  ExplorationQueryId,
  GetExplorationDataRequest,
  GetExplorationDataResponse,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag, provideMetricListTags } from "./tags";

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
        provideMetricListTags(response?.metrics ?? []),
    }),
    getExploration: builder.query<Exploration, ExplorationId>({
      query: (id) => ({
        method: "GET",
        url: `/api/exploration/${id}`,
      }),
      providesTags: (exploration) =>
        exploration ? [idTag("exploration", exploration.id)] : [],
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
    getExplorationQueryResult: builder.query<Dataset, ExplorationQueryId>({
      query: (id) => ({
        method: "GET",
        url: `/api/exploration/query/${id}`,
      }),
    }),
  }),
});

export const {
  useGetExplorationDataQuery,
  useGetExplorationQuery,
  useCreateExplorationMutation,
  useGetExplorationQueryResultQuery,
} = explorationApi;
