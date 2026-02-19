import type { GroupTableAccessPolicy } from "metabase-types/api";

import { Api } from "./api";
import { listTag } from "./tags";

export const groupTableAccessPolicyApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listGroupTableAccessPolicies: builder.query<
      GroupTableAccessPolicy[],
      { group_id?: number; table_id?: number } | void
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

export const { useListGroupTableAccessPoliciesQuery } =
  groupTableAccessPolicyApi;
