import {
  invalidateGitSyncOnCreate,
  invalidateGitSyncOnDelete,
  invalidateGitSyncOnUpdate,
} from "metabase/api/utils/git-sync-cache-helpers";
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
        invalidateGitSyncOnCreate(dispatch, queryFulfilled);
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
      onQueryStarted: (
        updateRequest,
        { dispatch, queryFulfilled, getState },
      ) => {
        const state = getState();
        const oldDocument = documentApi.endpoints.getDocument.select({
          id: updateRequest.id,
        })(state)?.data;
        invalidateGitSyncOnUpdate(oldDocument, dispatch, queryFulfilled);
      },
      invalidatesTags: (_, error, { id }) =>
        !error ? [listTag("document"), idTag("document", id)] : [],
    }),
    deleteDocument: builder.mutation<void, DeleteDocumentRequest>({
      query: (document) => ({
        method: "DELETE",
        url: `/api/ee/document/${document.id}`,
      }),
      onQueryStarted: (deleteRequest, { dispatch, getState }) => {
        const state = getState();
        const document = documentApi.endpoints.getDocument.select({
          id: deleteRequest.id,
        })(state)?.data;
        invalidateGitSyncOnDelete(document, dispatch);
      },
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
