export type HelpAssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HelpAssistantSource = {
  title: string;
  url: string;
};

export type HelpAssistantFeedback = {
  positive: boolean;
  comment?: string | null;
};

export type HelpAssistantChatEntry = HelpAssistantMessage & {
  sources?: HelpAssistantSource[];
  feedback?: HelpAssistantFeedback;
};

export type HelpAssistantConversationId = string;

/** A saved conversation, stored in the `help_assistant` user key-value namespace. */
export type HelpAssistantConversation = {
  title: string;
  updated_at: string;
  messages: HelpAssistantChatEntry[];
};

export type HelpAssistantChatRequest = {
  messages: HelpAssistantMessage[];
  diagnostic_info?: string;
};

export type HelpAssistantChatResponse = {
  reply: string;
  sources: HelpAssistantSource[];
};

export type HelpAssistantFeedbackRequest = HelpAssistantFeedback & {
  question: string;
  answer: string;
  sources?: HelpAssistantSource[];
};
