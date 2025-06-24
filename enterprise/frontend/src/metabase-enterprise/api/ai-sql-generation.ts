import type {
  GenerateSqlQueryRequest,
  GenerateSqlQueryResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const aiSqlGenerationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    generateSqlQuery: builder.query<
      GenerateSqlQueryResponse,
      GenerateSqlQueryRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/ai-sql-generation/generate",
        body,
      }),
    }),
  }),
});

export const { useGenerateSqlQueryQuery, useLazyGenerateSqlQueryQuery } =
  aiSqlGenerationApi;
