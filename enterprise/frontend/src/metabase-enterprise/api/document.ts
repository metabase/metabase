import type {
  Card,
  CreateDocumentRequest,
  Document,
  DocumentContent,
  DocumentId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag } from "./tags";

export const documentApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDocument: builder.query<Document, { id: DocumentId; version?: number }>({
      query: ({ id, version }) => ({
        method: "GET",
        url: `/api/ee/document/${id}`,
        params: { version },
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
      invalidatesTags: (_, error) => (error ? [] : []), // TODO: invalidate parent collection?
    }),
    updateDocument: builder.mutation<
      Document,
      Pick<Document, "id" | "name"> & {
        document?: DocumentContent;
        cards?: Record<number, Card>;
      }
    >({
      query: (document) => ({
        method: "PUT",
        url: `/api/ee/document/${document.id}`,
        body: document,
      }),
      invalidatesTags: (_, error, { id }) =>
        !error ? [idTag("document", id)] : [],
    }),
  }),
});

export const {
  useGetDocumentQuery,
  useCreateDocumentMutation,
  useUpdateDocumentMutation,
} = documentApi;
