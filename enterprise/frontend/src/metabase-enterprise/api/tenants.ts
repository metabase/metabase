import type {
  CreateTenantInput,
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
  Tenant,
  UpdateTenantInput,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";
import { provideCollectionItemListTags } from "metabase/api/tags";

export const tenantsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createTenant: builder.mutation<void, CreateTenantInput>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/tenant",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [listTag("tenant")]),
    }),
    getTenant: builder.query<Tenant, Tenant["id"]>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/tenant/${id}`,
      }),
      providesTags: (_, __, id) => [idTag("tenant", id)],
    }),
    listTenants: builder.query<
      { data: Tenant[] },
      { status: "active" | "deactivated" | "all" }
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/tenant",
        params,
      }),
      providesTags: [listTag("tenant")],
    }),
    updateTenant: builder.mutation<void, UpdateTenantInput>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/tenant/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("tenant"),
          idTag("tenant", id),
          // since users inherit tenant attributes, we can get stale caches
          "user",
        ]),
    }),
    listTenantCollectionItems: builder.query<
      ListCollectionItemsResponse,
      ListCollectionItemsRequest
    >({
      query: ({ id: _id, ...params }) => ({
        method: "GET",
        url: `/api/ee/tenant/collection/root/items`,
        params,
      }),
      providesTags: (response, _error, { models }) =>
        provideCollectionItemListTags(response?.data ?? [], models),
    }),
  }),
});

export const {
  useCreateTenantMutation,
  useGetTenantQuery,
  useListTenantsQuery,
  useUpdateTenantMutation,
  useListTenantCollectionItemsQuery,
} = tenantsApi;
