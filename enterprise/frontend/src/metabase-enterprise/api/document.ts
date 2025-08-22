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
        await queryFulfilled.then(async ({ data }) => {
          await dispatch(
            documentApi.util.upsertQueryData(
              "getDocument",
              { id: data.id },
              data,
            ),
          );
        });
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
  }),
});

export const {
  useGetDocumentQuery,
  useCreateDocumentMutation,
  useUpdateDocumentMutation,
} = documentApi;
