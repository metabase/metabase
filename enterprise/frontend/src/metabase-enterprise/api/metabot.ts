import type {
  MetabotAgentRequest,
  MetabotAgentResponse,
} from "metabase-types/api";

import { aiStreamingQuery } from "./ai-streaming-base-query";
import { EnterpriseApi } from "./api";

export const metabotApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    metabotAgent: builder.mutation<MetabotAgentResponse, MetabotAgentRequest>({
      queryFn: async (body, { signal }) => {
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
            onToolCallPart: (value) => console.log("ON TOOL CALL PART", value),
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
      } /*(body) => ({
        method: "POST",
        url: "/api/ee/metabot-v3/v2/agent",
        body,
      })*/,
    }),
  }),
});

export const { metabotAgent } = metabotApi.endpoints;
export const { useMetabotAgentMutation } = metabotApi;
