import type { CardDisplayType } from "./visualization";

export type MetabotFeedbackType =
  | "great"
  | "wrong_data"
  | "incorrect_result"
  | "invalid_sql";

/* Metabot v3 - Base Types */

export type MetabotChatContext = {
  current_time_with_timezone: string;
} & Record<string, any>;

export type MetabotTool = {
  name: string; // TODO: make strictly typed - currently there's no tools
  parameters: Record<string, any>;
};

export type MetabotHistoryUserMessageEntry = {
  role: "user";
  message: string;
  context: MetabotChatContext;
};

export type MetabotHistoryToolEntry = {
  role: "assistant";
  assistant_response_type: "tools";
  tools: MetabotTool[];
};

export type MetabotHistoryMessageEntry = {
  role: "assistant";
  assistant_response_type: "message";
  message: string;
};

export type MetabotHistoryEntry =
  | MetabotHistoryUserMessageEntry
  | MetabotHistoryToolEntry
  | MetabotHistoryMessageEntry;

export type MetabotHistory = any;

export type MetabotMessageReaction = {
  type: "metabot.reaction/message";
  message: string;
};

export type MetabotChangeDisplayTypeReaction = {
  type: "metabot.reaction/change-display-type";
  display_type: CardDisplayType;
};

export type MetabotChangeVisiualizationSettingsReaction = {
  type: "metabot.reaction/change-table-visualization-settings";
  visible_columns: string[];
};

export type MetabotConfirmationReaction = {
  type: "metabot.reaction/confirmation";
  description: string;
  options: Record<string, MetabotReaction[]>;
};

export type MetabotWriteBackReaction = {
  type: "metabot.reaction/writeback";
  message: string;
};

export type MetabotApiCallReaction = {
  type: "metabot.reaction/api-call";
  api_call: {
    method: string;
    url: string;
    body?: Record<string, any>;
  };
};

export type MetabotReaction =
  | MetabotMessageReaction
  | MetabotChangeDisplayTypeReaction
  | MetabotChangeVisiualizationSettingsReaction
  | MetabotConfirmationReaction
  | MetabotWriteBackReaction
  | MetabotApiCallReaction;

/* Metabot v3 - API Request Types */

export type MetabotAgentRequest = {
  message: string;
  context: MetabotChatContext;
  history: MetabotHistory[];
};

export type MetabotAgentResponse = {
  reactions: MetabotReaction[];
  history: MetabotHistory[];
};

/* Metabot v3 - Type Guards */

export const isMetabotMessageReaction = (
  reaction: MetabotReaction,
): reaction is MetabotMessageReaction => {
  return reaction.type === "metabot.reaction/message";
};

export const isMetabotToolMessage = (
  message: MetabotHistoryEntry,
): message is MetabotHistoryToolEntry => {
  return (
    message.role === "assistant" && message.assistant_response_type === "tools"
  );
};

export const isMetabotHistoryMessage = (
  message: MetabotHistoryEntry,
): message is MetabotHistoryMessageEntry => {
  return (
    message.role === "assistant" &&
    message.assistant_response_type === "message"
  );
};

export const isMetabotMessage = (
  message: MetabotHistoryEntry,
): message is MetabotHistoryMessageEntry => {
  return message.role === "assistant";
};
