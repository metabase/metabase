import type {
  CreateEmbeddingThemeRequest,
  EmbeddingTheme,
  UpdateEmbeddingThemeRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export const embeddingThemeApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listEmbeddingThemes: builder.query<EmbeddingTheme[], void>({
      query: () => `/api/embed-theme`,
      providesTags: (themes) =>
        themes
          ? [
              ...themes.map((theme) => idTag("embed-theme", theme.id)),
              listTag("embed-theme"),
            ]
          : [listTag("embed-theme")],
    }),
    getEmbeddingTheme: builder.query<EmbeddingTheme, number>({
      query: (id) => `/api/embed-theme/${id}`,
      providesTags: (_, __, id) => [idTag("embed-theme", id)],
    }),
    createEmbeddingTheme: builder.mutation<
      EmbeddingTheme,
      CreateEmbeddingThemeRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/embed-theme`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("embed-theme")]),
    }),
    updateEmbeddingTheme: builder.mutation<
      EmbeddingTheme,
      UpdateEmbeddingThemeRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/embed-theme/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("embed-theme"),
          idTag("embed-theme", id),
        ]),
    }),
    deleteEmbeddingTheme: builder.mutation<void, number>({
      query: (id) => ({ method: "DELETE", url: `/api/embed-theme/${id}` }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("embed-theme"),
          idTag("embed-theme", id),
        ]),
    }),
  }),
});

export const {
  useListEmbeddingThemesQuery,
  useGetEmbeddingThemeQuery,
  useCreateEmbeddingThemeMutation,
  useUpdateEmbeddingThemeMutation,
  useDeleteEmbeddingThemeMutation,
} = embeddingThemeApi;
