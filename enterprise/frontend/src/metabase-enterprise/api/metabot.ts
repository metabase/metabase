import type { MetabotPromptSuggestions } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const metabotApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSuggestedMetabotPrompts: builder.query<MetabotPromptSuggestions, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/metabot-v3/v2/prompt-suggestions",
      }),
    }),
  }),
});

export const { useGetSuggestedMetabotPromptsQuery } = metabotApi;
