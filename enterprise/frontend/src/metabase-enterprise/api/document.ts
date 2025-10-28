import type {
  CreateDocumentRequest,
  DeleteDocumentRequest,
  Document,
  GetDocumentRequest,
  UpdateDocumentRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, listTag } from "./tags";

export const documentApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDocument: builder.query<Document, GetDocumentRequest>({
      query: ({ id }) => ({
        method: "GET",
        url: `/api/ee/document/${id}`,
      }),
      providesTags: (result, error, { id }) =>
        !error ? [idTag("document", id)] : [],
    }),
    createDocument: builder.mutation<Document, CreateDocumentRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/document",
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
        url: `/api/ee/document/${document.id}`,
        body: document,
      }),
      invalidatesTags: (_, error, { id }) =>
        !error ? [listTag("document"), idTag("document", id)] : [],
    }),
    deleteDocument: builder.mutation<void, DeleteDocumentRequest>({
      query: (document) => ({
        method: "DELETE",
        url: `/api/ee/document/${document.id}`,
      }),
      invalidatesTags: (_, error, { id }) =>
        !error ? [listTag("document"), idTag("document", id)] : [],
    }),
    listPublicDocuments: builder.query<
      Array<Pick<Document, "id" | "name" | "public_uuid">>,
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/ee/document/public",
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
        url: `/api/ee/document/${id}/public-link`,
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
        url: `/api/ee/document/${id}/public-link`,
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
  useListPublicDocumentsQuery,
  useCreateDocumentPublicLinkMutation,
  useDeleteDocumentPublicLinkMutation,
} = documentApi;
