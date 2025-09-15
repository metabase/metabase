import { Api } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export type GlossaryItem = {
  id: number;
  term: string;
  definition: string;
};

export type ListGlossaryRequest = {
  search?: string;
};

export type CreateGlossaryRequest = {
  term: string;
  definition: string;
};

export type UpdateGlossaryRequest = {
  id: number;
  term: string;
  definition: string;
};

export const glossaryApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listGlossary: builder.query<GlossaryItem[], ListGlossaryRequest | void>({
      query: (params) => ({
        method: "GET",
        url: "/api/glossary",
        params,
      }),
      transformResponse: (response: { data: GlossaryItem[] }) => response.data,
      providesTags: (items = []) => [
        listTag("glossary"),
        ...items.map((item) => idTag("glossary", item.id)),
      ],
    }),
    createGlossary: builder.mutation<GlossaryItem, CreateGlossaryRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/glossary",
        body,
      }),
      invalidatesTags: (item, error) =>
        item ? invalidateTags(error, [listTag("glossary")]) : [],
    }),
    updateGlossary: builder.mutation<GlossaryItem, UpdateGlossaryRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/glossary/${id}`,
        body,
      }),
      invalidatesTags: (item, error) =>
        item
          ? invalidateTags(error, [
              listTag("glossary"),
              idTag("glossary", item.id),
            ])
          : [],
    }),
    deleteGlossary: builder.mutation<void, { id: number }>({
      query: ({ id }) => ({
        method: "DELETE",
        url: `/api/glossary/${id}`,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("glossary"), idTag("glossary", id)]),
    }),
  }),
});

export const {
  useListGlossaryQuery,
  useCreateGlossaryMutation,
  useUpdateGlossaryMutation,
  useDeleteGlossaryMutation,
} = glossaryApi;
