import type {
  ModelIndex,
  ModelIndexCreateQuery,
  ModelIndexDeleteQuery,
  ModelIndexesListQuery,
} from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, listTag, provideModelIndexListTags } from "./tags";

export const modelIndexApi = Api.injectEndpoints({
  endpoints: builder => ({
    listModelIndexes: builder.query<ModelIndex[], ModelIndexesListQuery>({
      query: body => ({
        method: "GET",
        url: "/api/model-index",
        body,
      }),
      providesTags: (modelIndexes = []) =>
        provideModelIndexListTags(modelIndexes),
    }),
    createModelIndex: builder.mutation<ModelIndex, ModelIndexCreateQuery>({
      query: body => ({
        method: "POST",
        url: "/api/model-index",
        body,
      }),
      invalidatesTags: (_modelIndex, error) => [
        ...invalidateTags(error, [listTag("model-index")]),
      ],
    }),
    deleteModelIndex: builder.mutation<ModelIndex, ModelIndexDeleteQuery>({
      query: ({ id }) => ({
        method: "DELETE",
        url: `/api/model-index/${id}`,
      }),
      invalidatesTags: (_modelIndex, error) => [
        ...invalidateTags(error, [listTag("model-index")]),
      ],
    }),
  }),
});

export const {
  useCreateModelIndexMutation,
  useListModelIndexesQuery,
  endpoints: { createModelIndex, listModelIndexes, deleteModelIndex },
} = modelIndexApi;
