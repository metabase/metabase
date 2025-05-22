import type {
  CreateTenantInput,
  Tenant,
  UpdateTenantInput,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

const mockTenants: Tenant[] = [
  {
    id: 1,
    name: `McDonald's`,
    slug: "mcdonalds",
    userCount: 12,
    is_active: true,
  },
  {
    id: 2,
    name: `Burger King`,
    slug: "burger-king",
    userCount: 28,
    is_active: true,
  },
  {
    id: 3,
    name: `Wendy's`,
    slug: "wendys",
    userCount: 19,
    is_active: true,
  },
  {
    id: 4,
    name: `Taco Bell`,
    slug: "taco-bell",
    userCount: 35,
    is_active: true,
  },
  {
    id: 5,
    name: `KFC`,
    slug: "kfc",
    userCount: 24,
    is_active: true,
  },
  {
    id: 6,
    name: `Subway`,
    slug: "subway",
    userCount: 40,
    is_active: true,
  },
  {
    id: 7,
    name: `Chipotle`,
    slug: "chipotle",
    userCount: 31,
    is_active: true,
  },
  {
    id: 8,
    name: `Domino's Pizza`,
    slug: "dominos-pizza",
    userCount: 8,
    is_active: true,
  },
  {
    id: 9,
    name: `Pizza Hut`,
    slug: "pizza-hut",
    userCount: 15,
    is_active: true,
  },
  {
    id: 10,
    name: `Chick-fil-A`,
    slug: "chick-fil-a",
    userCount: 37,
    is_active: true,
  },
];

// TODO: handle caching and invalidation
export const tenantsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createTenant: builder.mutation<void, CreateTenantInput>({
      queryFn: () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ data: undefined }), 1500);
        });
      },
    }),
    getTenant: builder.query<Tenant, Tenant["id"]>({
      queryFn: (id) =>
        new Promise((resolve) => {
          const data = mockTenants.find((tenant) => tenant.id === id);
          const error = data ? undefined : "blarf";
          setTimeout(() => resolve({ data, error } as any), 1500);
        }),
    }),
    listTenants: builder.query<Tenant[], { status: "active" | "deactivated" }>({
      queryFn: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ data: mockTenants }), 1500);
        }),
      providesTags: ["tenants"],
    }),
    updateTenant: builder.mutation<void, UpdateTenantInput>({
      queryFn: () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ data: undefined }), 1500);
        });
      },
    }),
  }),
});

export const {
  useCreateTenantMutation,
  useGetTenantQuery,
  useListTenantsQuery,
  useUpdateTenantMutation,
} = tenantsApi;
