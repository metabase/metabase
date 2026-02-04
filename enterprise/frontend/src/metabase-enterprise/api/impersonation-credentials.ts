import type {
  DatabaseImpersonationCredential,
  DeleteDatabaseImpersonationCredentialRequest,
  ListDatabaseImpersonationCredentialsRequest,
  UpsertDatabaseImpersonationCredentialRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export const impersonationCredentialsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listImpersonationCredentials: builder.query<
      DatabaseImpersonationCredential[],
      ListDatabaseImpersonationCredentialsRequest
    >({
      query: ({ db_id }) => ({
        url: "/api/ee/advanced-permissions/impersonation/credentials",
        params: { db_id },
      }),
      providesTags: (result, _error, { db_id }) =>
        result
          ? [
              listTag("impersonation-credentials"),
              idTag("impersonation-credentials", db_id),
            ]
          : [listTag("impersonation-credentials")],
    }),
    upsertImpersonationCredential: builder.mutation<
      DatabaseImpersonationCredential,
      UpsertDatabaseImpersonationCredentialRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/advanced-permissions/impersonation/credentials",
        body,
      }),
      invalidatesTags: (_result, error, { db_id }) =>
        invalidateTags(error, [
          listTag("impersonation-credentials"),
          idTag("impersonation-credentials", db_id),
        ]),
    }),
    deleteImpersonationCredential: builder.mutation<
      void,
      DeleteDatabaseImpersonationCredentialRequest
    >({
      query: ({ id }) => ({
        method: "DELETE",
        url: `/api/ee/advanced-permissions/impersonation/credentials/${id}`,
      }),
      invalidatesTags: (_result, error, { db_id }) =>
        invalidateTags(error, [
          listTag("impersonation-credentials"),
          idTag("impersonation-credentials", db_id),
        ]),
    }),
  }),
});

export const {
  useListImpersonationCredentialsQuery,
  useUpsertImpersonationCredentialMutation,
  useDeleteImpersonationCredentialMutation,
} = impersonationCredentialsApi;
