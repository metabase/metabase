import type {
  CreateTenantInput,
  Tenant,
  UpdateTenantInput,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

export const tenantsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createTenant: builder.mutation<void, CreateTenantInput>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/tenants",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [listTag("tenant")]),
    }),
    getTenant: builder.query<Tenant, Tenant["id"]>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/tenants/${id}`,
      }),
      providesTags: (_, __, id) => [idTag("tenant", id)],
    }),
    listTenants: builder.query<
      { data: Tenant[] },
      { status: "active" | "deactivated" }
    >({
      query: () => ({
        method: "GET",
        url: "/api/ee/tenants",
      }),
      providesTags: [listTag("tenant")],
    }),
    updateTenant: builder.mutation<void, UpdateTenantInput>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/tenants/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("tenant", id)]),
    }),
  }),
});

export const {
  useCreateTenantMutation,
  useGetTenantQuery,
  useListTenantsQuery,
  useUpdateTenantMutation,
} = tenantsApi;
