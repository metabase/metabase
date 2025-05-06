import type {
  MetabotAgentRequest,
  MetabotAgentResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { aiStreamingQuery } from "./ai-streaming-base-query";

export const metabotApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    metabotAgent: builder.mutation<MetabotAgentResponse, MetabotAgentRequest>({
      query: aiStreamingQuery(
        "/api/ee/metabot-v3/v2/agent-streaming",
      ) /*(body) => ({
        method: "POST",
        url: "/api/ee/metabot-v3/v2/agent",
        body,
      })*/,
    }),
  }),
});

export const { metabotAgent } = metabotApi.endpoints;
export const { useMetabotAgentMutation } = metabotApi;
