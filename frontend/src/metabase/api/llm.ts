import type {
  ExtractTablesRequest,
  ExtractTablesResponse,
  GenerateSqlRequest,
  GenerateSqlResponse,
  ListModelsResponse,
} from "metabase-types/api";

import { Api } from "./api";

export const llmApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    generateSql: builder.mutation<GenerateSqlResponse, GenerateSqlRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/llm/generate-sql",
        body,
      }),
    }),
    extractTables: builder.query<ExtractTablesResponse, ExtractTablesRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/llm/extract-tables",
        body,
      }),
    }),
    listModels: builder.query<ListModelsResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/llm/list-models",
      }),
    }),
  }),
});

export const {
  useGenerateSqlMutation,
  useExtractTablesQuery,
  useListModelsQuery,
} = llmApi;
