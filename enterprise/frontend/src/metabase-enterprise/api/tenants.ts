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
        url: "/api/ee/tenant",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("tenant"),
          listTag("embedding-hub-checklist"),
        ]),
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
  }),
});

export const {
  useCreateTenantMutation,
  useGetTenantQuery,
  useListTenantsQuery,
  useUpdateTenantMutation,
} = tenantsApi;
