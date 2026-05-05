import type {
  ExtractSourcesRequest,
  ExtractSourcesResponse,
} from "metabase-types/api";

import { Api } from "./api";

export const llmApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    extractSources: builder.query<
      ExtractSourcesResponse,
      ExtractSourcesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/llm/extract-sources",
        body,
      }),
    }),
  }),
});

export const { useExtractSourcesQuery } = llmApi;
