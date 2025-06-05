import type {
  CardId,
  CardType,
  CollectionId,
  DashboardId,
  DatasetQuery,
  SearchModel,
} from ".";

export type MetabotFeedbackType =
  | "great"
  | "wrong_data"
  | "incorrect_result"
  | "invalid_sql";

/* Metabot v3 - Base Types */

export type MetabotChatContext = {
  user_is_viewing: MetabotEntityInfo[];
  current_time_with_timezone: string;
};

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

export type MetabotRedirectReaction = {
  type: "metabot.reaction/redirect";
  url: string;
};

export type MetabotReaction = MetabotMessageReaction | MetabotRedirectReaction;

export type MetabotColumnInfo = {
  name: string;
  type?:
    | "number"
    | "string"
    | "date"
    | "datetime"
    | "time"
    | "boolean"
    | "null";
};

export type MetabotSeriesConfig = {
  x: MetabotColumnInfo;
  y?: MetabotColumnInfo;
  x_values?: Array<any>;
  y_values?: Array<any>;
  display_name: string;
  chart_type: string;
  stacked?: boolean;
};

export type MetabotChartConfig = {
  image_base_64?: string;
  title?: string | null;
  description?: string | null;
  data?: Array<{
    columns: Array<MetabotColumnInfo>;
    rows: Array<Array<string | number>>;
  }>;
  series?: Record<string, MetabotSeriesConfig>;
  timeline_events?: Array<{
    name: string;
    description?: string;
    timestamp: Date;
  }>;
};

export type MetabotCardInfo = {
  type: CardType;
  id: CardId;
  query: DatasetQuery;
  chart_configs?: Array<MetabotChartConfig>;
};

export type MetabotDashboardInfo = {
  type: "dashboard";
  id: DashboardId;
};

export type MetabotAdhocQueryInfo = {
  type: "adhoc";
  query: DatasetQuery;
  chart_configs?: Array<MetabotChartConfig>;
};

export type MetabotEntityInfo =
  | MetabotCardInfo
  | MetabotDashboardInfo
  | MetabotAdhocQueryInfo;

/* Metabot v3 - API Request Types */

export type MetabotAgentRequest = {
  message: string;
  context: MetabotChatContext;
  history: MetabotHistory[];
  conversation_id: string; // uuid
  state: any;
};

export type MetabotAgentResponse = {
  reactions: MetabotReaction[];
  history: MetabotHistory[];
  conversation_id: string;
  state: any;
};

export interface MetabotPromptSuggestions {
  prompts: Array<{ prompt: string }>;
}

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

export type MetabotId = number;
export type MetabotName = string;

export type MetabotInfo = {
  id: MetabotId;
  name: MetabotName;
};

export type MetabotEntity = {
  name: string;
  id: CollectionId;
  model: Extract<SearchModel, "collection">;
  collection_id: CollectionId;
  collection_name: string;
};

export type MetabotApiEntity = Omit<MetabotEntity, "id"> & {
  model_id: MetabotEntity["id"];
};
