import type { GroupTableAccessPolicy } from "metabase-types/api";

import { Api } from "./api";
import { listTag } from "./tags";

export const groupTableAccessPolicyApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    // When only one (or none) of group_id and table_id are provided
    // /api/mt/gtap returns a list of policies.
    listGroupTableAccessPolicies: builder.query<
      GroupTableAccessPolicy[],
      { group_id?: number } | { table_id?: number } | null | undefined
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/mt/gtap",
        params,
      }),
      providesTags: () => [listTag("group-table-access-policy")],
    }),
    // When both table_id and group_id are provided /api/mt/gtap returns
    // a single policy, so we need to use a different type for that case.
    getGroupTableAccessPolicy: builder.query<
      GroupTableAccessPolicy,
      { group_id: number; table_id: number }
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/mt/gtap",
        params,
      }),
      providesTags: () => [listTag("group-table-access-policy")],
    }),
  }),
});

export const {
  useListGroupTableAccessPoliciesQuery,
  useGetGroupTableAccessPolicyQuery,
} = groupTableAccessPolicyApi;
