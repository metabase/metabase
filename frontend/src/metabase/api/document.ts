import { Api } from "metabase/api/api";
import { idTag, listTag } from "metabase/api/tags";
import type {
  Card,
  CopyDocumentRequest,
  CreateDocumentRequest,
  Dataset,
  DeleteDocumentRequest,
  Document,
  GetDocumentRequest,
  GetPublicDocument,
  UpdateDocumentRequest,
} from "metabase-types/api";

export type StoredResultSort =
  | "value_asc"
  | "value_desc"
  | "label_asc"
  | "label_desc";

export interface StoredResultResponse {
  card: Card;
  dataset: Dataset;
}

export const documentApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getDocument: builder.query<Document, GetDocumentRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/document/${id}`,
      }),
      providesTags: (result, error, { id }) =>
        !error ? [idTag("document", id)] : [],
    }),
    createDocument: builder.mutation<Document, CreateDocumentRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/document",
        body,
      }),
      invalidatesTags: (_, error) => (error ? [] : [listTag("document")]),
      async onQueryStarted(_props, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        await dispatch(
          documentApi.util.upsertQueryData(
            "getDocument",
            { id: data.id },
            data,
          ),
        );
      },
    }),
    updateDocument: builder.mutation<Document, UpdateDocumentRequest>({
      query: (document) => ({
        method: "PUT",
        url: `/api/document/${document.id}`,
        body: document,
      }),
      invalidatesTags: (result, error, { id }) =>
        !error
          ? [
              listTag("document"),
              idTag("document", id),
              listTag("revision"),
              ...(result?.exploration_thread_id != null
                ? ["exploration" as const]
                : []),
            ]
          : [],
      async onQueryStarted(_props, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        await dispatch(
          documentApi.util.upsertQueryData(
            "getDocument",
            { id: data.id },
            data,
          ),
        );
      },
    }),
    deleteDocument: builder.mutation<void, DeleteDocumentRequest>({
      query: (document) => ({
        method: "DELETE",
        url: `/api/document/${document.id}`,
      }),
      invalidatesTags: (_, error, { id }) =>
        !error ? [listTag("document"), idTag("document", id)] : [],
    }),
    copyDocument: builder.mutation<Document, CopyDocumentRequest>({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/document/${id}/copy`,
        body,
      }),
      invalidatesTags: (_, error) => (error ? [] : [listTag("document")]),
      async onQueryStarted(_props, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        await dispatch(
          documentApi.util.upsertQueryData(
            "getDocument",
            { id: data.id },
            data,
          ),
        );
      },
    }),
    listPublicDocuments: builder.query<GetPublicDocument[], void>({
      query: () => ({
        method: "GET",
        url: "/api/document/public",
      }),
      providesTags: (result = []) => [
        ...result.map((res) => idTag("public-document", res.id)),
        listTag("public-document"),
      ],
    }),
    createDocumentPublicLink: builder.mutation<
      Pick<Document, "id"> & { uuid: Document["public_uuid"] },
      Pick<Document, "id">
    >({
      query: ({ id }) => ({
        method: "POST",
        url: `/api/document/${id}/public-link`,
      }),
      invalidatesTags: (_, error, { id }) =>
        !error ? [listTag("public-document"), idTag("document", id)] : [],
      transformResponse: ({ uuid }, _meta, { id }) => ({
        id,
        uuid,
      }),
    }),
    deleteDocumentPublicLink: builder.mutation<
      Pick<Document, "id">,
      Pick<Document, "id">
    >({
      query: ({ id }) => ({
        method: "DELETE",
        url: `/api/document/${id}/public-link`,
      }),
      transformResponse: (_baseQueryReturnValue, _meta, { id }) => ({ id }),
      invalidatesTags: (_, error, { id }) =>
        !error
          ? [
              listTag("public-document"),
              idTag("public-document", id),
              idTag("document", id),
            ]
          : [],
    }),
    getStoredResult: builder.query<
      StoredResultResponse,
      { id: number; sort?: StoredResultSort }
    >({
      query: ({ id, sort }) => ({
        method: "GET",
        url: `/api/document/stored-result/${id}`,
        params: sort ? { sort } : undefined,
      }),
      // Static cardEmbeds render from immutable cached snapshots, so keep them
      // around long enough that navigating between docs doesn't reload them.
      keepUnusedDataFor: 30 * 60,
    }),
  }),
});

export const {
  useGetDocumentQuery,
  useCreateDocumentMutation,
  useUpdateDocumentMutation,
  useDeleteDocumentMutation,
  useCopyDocumentMutation,
  useListPublicDocumentsQuery,
  useCreateDocumentPublicLinkMutation,
  useDeleteDocumentPublicLinkMutation,
  useGetStoredResultQuery,
} = documentApi;
