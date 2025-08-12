import type {
  CreateDocumentRequest,
  Document,
  DocumentId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, listTag } from "./tags";

export const documentApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDocument: builder.query<Document, { id: DocumentId }>({
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
      invalidatesTags: (_, error) => (error ? [] : [listTag("document")]), // TODO: invalidate parent collection?
    }),
    updateDocument: builder.mutation<Document, Partial<Document>>({
      query: (document) => ({
        method: "PUT",
        url: `/api/ee/document/${document.id}`,
        body: document,
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
