import type { AiFixSqlRequest, AiFixSqlResponse } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const aiSqlFixerApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    getFixedSql: builder.query<AiFixSqlResponse, AiFixSqlRequest>({
      query: body => ({
        method: "POST",
        url: "/api/ee/ai-sql-fixer/fix",
        body,
      }),
    }),
  }),
});

export const { useGetFixedSqlQuery } = aiSqlFixerApi;
