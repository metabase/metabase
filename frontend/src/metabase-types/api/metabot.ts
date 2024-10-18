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
  tools: MetabotTool[];
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

export const isMetabotToolMessage = (
  message: ChatMessage,
): message is MetabotToolMessage => {
  return message.source === "llm" && message.llm_response_type === "tools";
};

export const isMetabotChatMessage = (
  message: ChatMessage,
): message is MetabotChatMessage => {
  return message.source === "llm" && message.llm_response_type === "message";
};

export const isMetabotMessage = (
  message: ChatMessage,
): message is MetabotMessage => {
  return message.source === "llm";
};

export const isUserChatMessage = (
  message: ChatMessage,
): message is UserChatMessage => {
  return message.source === "user";
};
