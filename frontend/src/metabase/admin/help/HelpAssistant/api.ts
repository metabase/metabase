import { Api } from "metabase/api";

export type HelpAssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HelpAssistantSource = {
  title: string;
  url: string;
};

type ChatRequest = {
  messages: HelpAssistantMessage[];
  diagnostic_info?: string;
};

type ChatResponse = {
  reply: string;
  sources: HelpAssistantSource[];
};

const helpAssistantApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    sendHelpAssistantMessage: builder.mutation<ChatResponse, ChatRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/help-assistant/chat",
        body,
      }),
    }),
  }),
});

export const { useSendHelpAssistantMessageMutation } = helpAssistantApi;
