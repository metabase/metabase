import type {
  FixSqlQueryRequest,
  FixSqlQueryResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const aiSqlFixerApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getFixedSqlQuery: builder.query<FixSqlQueryResponse, FixSqlQueryRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/ai-sql-fixer/fix",
        body,
      }),
    }),
  }),
});

export const { useGetFixedSqlQueryQuery } = aiSqlFixerApi;
