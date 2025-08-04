import type {
  CreateDocumentRequest,
  Document,
  DocumentId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag } from "./tags";

// Types for agentic question creation
export interface AgenticQuestionRequest {
  prompt: string;
  auto_execute?: boolean;
}

export interface AgenticQuestionResponse {
  question_id: number | null;
  message: string;
  metadata?: {
    source_type?: string;
    source_name?: string;
    query?: any;
  };
}

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
      Pick<Document, "id" | "name" | "document"> & {
        card_ids?: number[];
      }
    >({
      query: (document) => ({
        method: "PUT",
        url: `/api/ee/document/${document.id}`,
        body: document,
      }),
      invalidatesTags: (_, error, { id }) =>
        !error ? [idTag("document", id), idTag("document-versions", id)] : [],
    }),
    // Agentic question creation endpoint
    createAgenticQuestion: builder.mutation<
      AgenticQuestionResponse,
      AgenticQuestionRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/metabot-v3/agentic-question-creation",
        body: {
          prompt: body.prompt,
          auto_execute: body.auto_execute ?? true,
        },
      }),
      transformResponse: (response: any) => {
        return {
          question_id: response.question_id,
          message: response.message,
          metadata: response.metadata,
        };
      },
      invalidatesTags: (_, error) => (!error ? ["questions"] : []),
    }),
  }),
});

export const {
  useGetDocumentQuery,
  useCreateDocumentMutation,
  useUpdateDocumentMutation,
  useCreateAgenticQuestionMutation,
} = documentApi;
