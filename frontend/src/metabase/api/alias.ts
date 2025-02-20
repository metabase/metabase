import type {
  AliasMapping,
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
  }),
});

export const {
  useListAliasesQuery,
  useGetAliasQuery,
} = aliasApi;
