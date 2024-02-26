import type { ModelIndex, CreateModelIndexInput } from "metabase-types/api";

import { Api } from "./api";
import { MODEL_INDEXES_TAG } from "./tags";

const tagWithId = (id: ModelIndex["id"]) => ({ type: MODEL_INDEXES_TAG, id });

export const modelIndexesApi = Api.injectEndpoints({
  endpoints: builder => ({
    listModelIndexes: builder.query<ModelIndex[], ModelIndex["model_id"]>({
      query: model_id => ({
        url: "/api/model-index",
        params: { model_id },
      }),
      providesTags: (_result, _error, id) => [tagWithId(id)],
    }),
    createModelIndex: builder.mutation<void, CreateModelIndexInput>({
      query: input => ({
        method: "POST",
        url: `/api/model-index`,
        body: input,
      }),
      invalidatesTags: (_result, _error, { model_id }) => [tagWithId(model_id)],
    }),
    deleteModelIndex: builder.mutation<void, ModelIndex["model_id"]>({
      query: id => ({ method: "DELETE", url: `/api/model-index/${id}` }),
      invalidatesTags: (_result, _error, id) => [tagWithId(id)],
    }),
  }),
});

export const {
  useListModelIndexesQuery,
  useCreateModelIndexMutation,
  useDeleteModelIndexMutation,
} = modelIndexesApi;
