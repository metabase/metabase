// TODO: refer to docs - try to make naming consistent with BE

export type MetabotFeedbackType =
  | "great"
  | "wrong_data"
  | "incorrect_result"
  | "invalid_sql";

export type MetabotAgentChatContext = Record<string, any>;

export type UserChatMessage = {
  source: "user";
  message: string;
  context: MetabotAgentChatContext;
};

export type MetabotTool = {
  name: string; // TODO: make strictly typed - currently there's no tools
  parameters: Record<string, any>;
};

export type MetabotChatMessage = {
  source: "llm";
  llm_response_type: "message";
  message: string;
};

export type MetabotToolMessage = {
  source: "llm";
  llm_response_type: "tools";
  tools: [MetabotTool, ...MetabotTool[]];
};

export type MetabotMessage = MetabotToolMessage | MetabotChatMessage;

export type ChatMessage = UserChatMessage | MetabotMessage;

export type MetabotAgentRequest = {
  message: string;
  context: MetabotAgentChatContext;
  messages: ChatMessage[];
};

export type MetabotAgentMessage = {
  type: "metabot.reaction/message";
  message: string;
};

export type MetabotAgentResponse = MetabotAgentMessage[];
