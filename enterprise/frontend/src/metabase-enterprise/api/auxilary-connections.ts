import { idTag, invalidateTags, listTag } from "metabase/api/tags";
import type {
  DeleteAuxiliaryConnectionRequest,
  DeleteAuxiliaryConnectionResponse,
  GetAuxiliaryConnectionInfoRequest,
  GetAuxiliaryConnectionInfoResponse,
  UpdateAuxiliaryConnectionRequest,
  UpdateAuxiliaryConnectionResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const auxiliaryConnectionsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAuxiliaryConnectionInfo: builder.query<
      GetAuxiliaryConnectionInfoResponse,
      GetAuxiliaryConnectionInfoRequest
    >({
      query: ({ id, type }) => ({
        method: "GET",
        url: `/api/ee/auxiliary-connections/${id}/${type}`,
      }),
      providesTags: (_, _error, { id }) => [idTag("database", id)],
    }),
    updateAuxiliaryConnection: builder.mutation<
      UpdateAuxiliaryConnectionResponse,
      UpdateAuxiliaryConnectionRequest
    >({
      query: ({ id, type, ...body }) => ({
        method: "POST",
        url: `/api/ee/auxiliary-connections/${id}/${type}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("database"), idTag("database", id)]),
    }),
    deleteAuxiliaryConnection: builder.mutation<
      DeleteAuxiliaryConnectionResponse,
      DeleteAuxiliaryConnectionRequest
    >({
      query: ({ id, type }) => ({
        method: "DELETE",
        url: `/api/ee/auxiliary-connections/${id}/${type}`,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("database"), idTag("database", id)]),
    }),
  }),
});

export const {
  useGetAuxiliaryConnectionInfoQuery,
  useUpdateAuxiliaryConnectionMutation,
  useDeleteAuxiliaryConnectionMutation,
} = auxiliaryConnectionsApi;
