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
      // Optimistically add the new item to the list cache
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const tempId = Date.now();
        const patchResult = dispatch(
          glossaryApi.util.updateQueryData(
            "listGlossary",
            undefined,
            (draft) => {
              // Add a temporary item to appear immediately
              draft.unshift({
                id: tempId,
                term: arg.term,
                definition: arg.definition,
              });
            },
          ),
        );

        try {
          const { data } = await queryFulfilled;
          // Replace temporary item with the server response
          dispatch(
            glossaryApi.util.updateQueryData(
              "listGlossary",
              undefined,
              (draft) => {
                const idx = draft.findIndex((g) => g.id === tempId);
                if (idx !== -1) {
                  draft[idx] = data;
                } else {
                  draft.unshift(data);
                }
              },
            ),
          );
        } catch {
          // Revert if the request failed
          patchResult.undo();
        }
      },
      invalidatesTags: (item, error) =>
        item ? invalidateTags(error, [listTag("glossary")]) : [],
    }),
    updateGlossary: builder.mutation<GlossaryItem, UpdateGlossaryRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/glossary/${id}`,
        body,
      }),

      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          glossaryApi.util.updateQueryData(
            "listGlossary",
            undefined,
            (draft) => {
              const item = draft.find((g) => g.id === arg.id);
              if (item) {
                item.term = arg.term;
                item.definition = arg.definition;
              }
            },
          ),
        );

        try {
          await queryFulfilled;
          // No action needed; server result matches optimistic update
        } catch {
          patchResult.undo();
        }
      },
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

      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          glossaryApi.util.updateQueryData(
            "listGlossary",
            undefined,
            (draft) => {
              const idx = draft.findIndex((g) => g.id === id);
              if (idx !== -1) {
                draft.splice(idx, 1);
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
