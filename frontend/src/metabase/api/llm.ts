import type {
  ExtractTablesRequest,
  ExtractTablesResponse,
  GenerateSqlRequest,
  GenerateSqlResponse,
} from "metabase-types/api";

import { Api } from "./api";

export const llmApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    extractTables: builder.mutation<
      ExtractTablesResponse,
      ExtractTablesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/llm/extract-tables",
        body,
      }),
    }),
    generateSql: builder.mutation<GenerateSqlResponse, GenerateSqlRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/llm/generate-sql",
        body,
      }),
    }),
  }),
});

export const { useExtractTablesMutation, useGenerateSqlMutation } = llmApi;
