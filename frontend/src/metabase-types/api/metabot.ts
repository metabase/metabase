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

export type MetabotStringFilterDetails = {
  column: string;
  operator:
    | "="
    | "!="
    | "contains"
    | "does-not-contain"
    | "starts-with"
    | "ends-with";
  value: string;
};

export type MetabotNumberFilterDetails = {
  column: string;
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=";
  value: number;
};

export type MetabotBooleanFilterDetails = {
  column: string;
  value: boolean;
};

export type MetabotSpecificDateFilterDetails = {
  column: string;
  operator: "=" | ">" | "<";
  value: string;
};

export type MetabotRelativeDateFilterDetails = {
  column: string;
  direction: "last" | "current" | "next";
  value: number;
  unit: "day" | "week" | "month" | "quarter" | "year";
};

export type MetabotAggregateQueryDetails = {
  operator: string;
  column: string | null;
};

export type MetabotBreakoutQueryDetails = {
  column: string;
};

export type MetabotOrderByQueryDetails = {
  column: string;
  direction: "asc" | "desc" | null;
};

export type MetabotLimitQueryDetails = {
  limit: number;
};

export type MetabotChangeQueryReaction = {
  type: "metabot.reaction/change-query";
  string_filters: MetabotStringFilterDetails[];
  number_filters: MetabotNumberFilterDetails[];
  boolean_filters: MetabotBooleanFilterDetails[];
  specific_date_filters: MetabotSpecificDateFilterDetails[];
  relative_date_filters: MetabotRelativeDateFilterDetails[];
  aggregations: MetabotAggregateQueryDetails[];
  breakouts: MetabotBreakoutQueryDetails[];
  order_bys: MetabotOrderByQueryDetails[];
  limits: MetabotLimitQueryDetails[];
};

export type MetabotChangeAxesLabelsReaction = {
  type: "metabot.reaction/change-axes-labels";
  x_axis_label: string | null;
  y_axis_label: string | null;
};

export type MetabotReaction =
  | MetabotChangeAxesLabelsReaction
  | MetabotMessageReaction
  | MetabotChangeDisplayTypeReaction
  | MetabotChangeVisiualizationSettingsReaction
  | MetabotConfirmationReaction
  | MetabotWriteBackReaction
  | MetabotApiCallReaction
  | MetabotChangeQueryReaction;

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
