import type {
  CreateSupportAccessGrantRequest,
  CurrentSupportAccessGrantResponse,
  ListSupportAccessGrantsRequest,
  ListSupportAccessGrantsResponse,
  SupportAccessGrant,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideSupportAccessGrantListTags,
  provideSupportAccessGrantTags,
} from "./tags";

export const supportAccessGrantsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSupportAccessGrants: builder.query<
      ListSupportAccessGrantsResponse,
      ListSupportAccessGrantsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/support-access-grant",
        params,
      }),
      providesTags: (response) =>
        response ? provideSupportAccessGrantListTags(response.data) : [],
    }),

    getCurrentSupportAccessGrant: builder.query<
      CurrentSupportAccessGrantResponse,
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/ee/support-access-grant/current",
      }),
      providesTags: (response) =>
        response ? provideSupportAccessGrantTags(response) : [],
    }),

    createSupportAccessGrant: builder.mutation<
      SupportAccessGrant,
      CreateSupportAccessGrantRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/support-access-grant",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("support-access-grant")]),
    }),

    revokeSupportAccessGrant: builder.mutation<SupportAccessGrant, number>({
      query: (id) => ({
        method: "PUT",
        url: `/api/ee/support-access-grant/${id}/revoke`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("support-access-grant", id),
          listTag("support-access-grant"),
        ]),
    }),
  }),
});

export const {
  useListSupportAccessGrantsQuery,
  useGetCurrentSupportAccessGrantQuery,
  useCreateSupportAccessGrantMutation,
  useRevokeSupportAccessGrantMutation,
} = supportAccessGrantsApi;
