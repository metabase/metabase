import type {
  GenerateSqlRequest,
  GenerateSqlResponse,
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
  }),
});

export const { useGenerateSqlMutation } = llmApi;
