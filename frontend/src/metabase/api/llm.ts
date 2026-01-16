import type {
  ExtractTablesRequest,
  ExtractTablesResponse,
  GenerateSqlRequest,
  GenerateSqlResponse,
  GetTableColumnsWithContextRequest,
  GetTableColumnsWithContextResponse,
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
    getTableColumnsWithContext: builder.query<
      GetTableColumnsWithContextResponse,
      GetTableColumnsWithContextRequest
    >({
      query: ({ table_id, database_id }) => ({
        method: "GET",
        url: `/api/llm/table/${table_id}/columns-with-context`,
        params: { database_id },
      }),
    }),
  }),
});

export const {
  useExtractTablesMutation,
  useGenerateSqlMutation,
  useGetTableColumnsWithContextQuery,
  useLazyGetTableColumnsWithContextQuery,
} = llmApi;
