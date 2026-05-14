import { Api } from "metabase/api/api";
import { idTag, listTag } from "metabase/api/tags";

import type {
  CreateSlidesRequest,
  GenerateSlidesRequest,
  GenerateSlidesResponse,
  SlidesDeck,
  UpdateSlidesRequest,
} from "metabase/slides/types";

interface ListSlidesResponse {
  items: SlidesDeck[];
}

export const slidesApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listSlides: builder.query<ListSlidesResponse, void>({
      query: () => ({ method: "GET", url: "/api/slides" }),
      providesTags: (result) => [
        listTag("slides"),
        ...(result?.items ?? []).map(({ id }) => idTag("slides", id)),
      ],
    }),
    getSlides: builder.query<SlidesDeck, { id: number }>({
      query: ({ id }) => ({ method: "GET", url: `/api/slides/${id}` }),
      providesTags: (_result, error, { id }) =>
        !error ? [idTag("slides", id)] : [],
    }),
    createSlides: builder.mutation<SlidesDeck, CreateSlidesRequest>({
      query: (body) => ({ method: "POST", url: "/api/slides", body }),
      invalidatesTags: (_, error) => (error ? [] : [listTag("slides")]),
      async onQueryStarted(_args, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        await dispatch(
          slidesApi.util.upsertQueryData("getSlides", { id: data.id }, data),
        );
      },
    }),
    updateSlides: builder.mutation<SlidesDeck, UpdateSlidesRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/slides/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        !error ? [listTag("slides"), idTag("slides", id)] : [],
      async onQueryStarted(_args, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        await dispatch(
          slidesApi.util.upsertQueryData("getSlides", { id: data.id }, data),
        );
      },
    }),
    deleteSlides: builder.mutation<void, { id: number }>({
      query: ({ id }) => ({ method: "DELETE", url: `/api/slides/${id}` }),
      invalidatesTags: (_, error, { id }) =>
        !error ? [listTag("slides"), idTag("slides", id)] : [],
    }),
    generateSlides: builder.mutation<
      GenerateSlidesResponse,
      GenerateSlidesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/slides/generate",
        body,
      }),
    }),
  }),
});

export const {
  useListSlidesQuery,
  useGetSlidesQuery,
  useCreateSlidesMutation,
  useUpdateSlidesMutation,
  useDeleteSlidesMutation,
  useGenerateSlidesMutation,
} = slidesApi;
