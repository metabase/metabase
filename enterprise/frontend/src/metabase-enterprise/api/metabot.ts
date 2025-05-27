import type {
  MetabotAgentRequest,
  MetabotAgentResponse,
  MetabotPromptSuggestions,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { aiStreamingQuery } from "./ai-streaming-base-query";

export const metabotApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    metabotAgent: builder.mutation<MetabotAgentResponse, MetabotAgentRequest>({
      queryFn: async (body, { signal }) => {
        try {
          const response = await aiStreamingQuery(
            "/api/ee/metabot-v3/v2/agent-streaming",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal,
            },
            {
              onDataPart: (value) => console.log("ON DATA PART", value),
              onTextPart: (value) => console.log("ON TEXT PART", value),
              onToolCallPart: (value) =>
                console.log("ON TOOL CALL PART", value),
              onToolResultPart: (value) =>
                console.log("ON TOOL RESULT PART", value),
            },
          );

          console.log("RESPONSE", response);

          return {
            data: {
              conversation_id: body.conversation_id,
              history: [],
              reactions: [],
              state: null,
            },
          };
        } catch (e) {
          const error = e instanceof Error ? e.message : "Unknown error";
          return {
            error: {
              status: "FETCH_ERROR",
              error,
            },
          };
        }
      } /*(body) => ({
        method: "POST",
        url: "/api/ee/metabot-v3/v2/agent",
        body,
      })*/,
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
