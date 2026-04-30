import type {
  ExtractTablesRequest,
  ExtractTablesResponse,
} from "metabase-types/api";

import { Api } from "./api";

export const llmApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    extractTables: builder.query<ExtractTablesResponse, ExtractTablesRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/llm/extract-tables",
        body,
      }),
    }),
  }),
});

export const { useExtractTablesQuery } = llmApi;
