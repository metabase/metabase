import type { TagDescription } from "@reduxjs/toolkit/query";

import type {
  CreateDocumentRequest,
  Document,
  DocumentId,
  DocumentVersions,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";
import type { TagType } from "./tags/constants";

function provideDocumentListTags(
  documents: Document[],
): TagDescription<TagType>[] {
  return [
    listTag("document"),
    ...documents.map((doc) => idTag("document", doc.id)),
  ];
}

function provideDocumentTags(document: Document): TagDescription<TagType>[] {
  return [idTag("document", document.id)];
}

function provideDocumentVersionTags(
  version: Document,
  documentId: DocumentId,
): TagDescription<TagType>[] {
  return [idTag("document-version", version.id), idTag("document", documentId)];
}

export const documentApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listDocuments: builder.query<Document[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/document",
      }),
      providesTags: (documents = []) => provideDocumentListTags(documents),
    }),

    getDocument: builder.query<Document, { id: DocumentId; version?: number }>({
      query: ({ id, version }) => ({
        method: "GET",
        url: `/api/ee/document/${id}`,
        params: version !== undefined ? { version } : undefined,
      }),
      providesTags: (document) =>
        document ? provideDocumentTags(document) : [],
    }),

    createDocument: builder.mutation<Document, CreateDocumentRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/document",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("document")]),
    }),

    updateDocument: builder.mutation<
      Document,
      Partial<CreateDocumentRequest> & { id: DocumentId }
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/document/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("document"), idTag("document", id)]),
    }),

    getDocumentVersions: builder.query<DocumentVersions, DocumentId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/document/${id}/versions`,
      }),
      providesTags: (versions = [], error, id) =>
        [
          ...versions.map((version) => provideDocumentVersionTags(version, id)),
          idTag("document", id),
        ].flat(),
    }),
  }),
});

export const {
  useListDocumentsQuery,
  useGetDocumentQuery,
  useLazyGetDocumentQuery,
  useCreateDocumentMutation,
  useUpdateDocumentMutation,
  useGetDocumentVersionsQuery,
} = documentApi;
