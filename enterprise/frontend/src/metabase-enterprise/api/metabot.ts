import type {
  MetabotAgentRequest,
  MetabotAgentResponse,
  MetabotPromptSuggestions,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const metabotApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    metabotAgent: builder.mutation<MetabotAgentResponse, MetabotAgentRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/metabot-v3/v2/agent",
        body,
      }),
    }),
    getSuggestedMetabotPrompts: builder.query<MetabotPromptSuggestions, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/metabot-v3/v2/prompt-suggestions",
      }),
    }),
  }),
});

export const { metabotAgent } = metabotApi.endpoints;
export const { useMetabotAgentMutation, useGetSuggestedMetabotPromptsQuery } =
  metabotApi;
