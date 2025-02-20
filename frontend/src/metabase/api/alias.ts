import { invalid } from "moment-timezone";

import type {
  AliasMapping,
  DashboardId,
} from "metabase-types/api";

import { Api } from "./api";

export const aliasApi = Api.injectEndpoints({
  endpoints: builder => ({
    listAliases: builder.query<AliasMapping[], void>({
      query: () => `/api/alias`,
    }),
    getAlias: builder.query<AliasMapping, string>({
      query: (name) => `/api/alias/${name}`,
    }),
    createDraft: builder.mutation<{ id: DashboardId }, DashboardId>({
      query: (id) => ({
        method: "POST",
        url: `/api/alias/${id}/draft`,
      }),
      invalidatesTags: () => ["aliases"], // this is silly
    }),
    promote: builder.mutation<void, DashboardId>({
      query: (id) => ({
        method: "POST",
        url: `/api/alias/${id}/promote`,
      }),
      invalidatesTags: () => ["aliases"], // this is silly
    }),

  }),
});

export const {
  useListAliasesQuery,
  useGetAliasQuery,
  useCreateDraftMutation,
  usePromoteMutation,
} = aliasApi;
