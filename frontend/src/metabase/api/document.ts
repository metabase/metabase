import { Api } from "metabase/api/api";
import { idTag, invalidateTags, listTag } from "metabase/api/tags";
import type {
  Card,
  CopyDocumentRequest,
  CreateCardRequest,
  CreateDocumentRequest,
  DeleteDocumentRequest,
  Document,
  DocumentId,
  GetDocumentRequest,
  GetPublicDocument,
  UpdateDocumentRequest,
} from "metabase-types/api";

export type CreateDocumentCardRequest = { document_id: DocumentId } & Omit<
  CreateCardRequest,
  "document_id" | "collection_id" | "dashboard_id" | "dashboard_tab_id"
>;

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
      invalidatesTags: (_, error, { id }) =>
        !error
          ? [listTag("document"), idTag("document", id), listTag("revision")]
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
    createDocumentCard: builder.mutation<Card, CreateDocumentCardRequest>({
      query: ({ document_id, ...body }) => ({
        method: "POST",
        url: `/api/document/${document_id}/card`,
        body,
      }),
      invalidatesTags: (_card, error, { document_id }) =>
        invalidateTags(error, [
          listTag("card"),
          idTag("document", document_id),
        ]),
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
  }),
});

export const {
  useGetDocumentQuery,
  useCreateDocumentMutation,
  useUpdateDocumentMutation,
  useDeleteDocumentMutation,
  useCopyDocumentMutation,
  useCreateDocumentCardMutation,
  useListPublicDocumentsQuery,
  useCreateDocumentPublicLinkMutation,
  useDeleteDocumentPublicLinkMutation,
} = documentApi;
