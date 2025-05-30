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

export type MetabotHistory = any[];

export type MetabotStateContext = Record<string, any>;

export type MetabotCardInfo = {
  type: CardType;
  id: CardId;
};

export type MetabotDashboardInfo = {
  type: "dashboard";
  id: DashboardId;
};

export type MetabotAdhocQueryInfo = {
  type: "adhoc";
  query: DatasetQuery;
};

export type MetabotEntityInfo =
  | MetabotCardInfo
  | MetabotDashboardInfo
  | MetabotAdhocQueryInfo;

/* Metabot v3 - API Request Types */

export type MetabotAgentRequest = {
  message: string;
  context: MetabotChatContext;
  history: MetabotHistory;
  conversation_id: string; // uuid
  state: any;
};

export type MetabotAgentResponse = {
  history: MetabotHistory;
  conversation_id: string;
  state: any;
};

export interface MetabotPromptSuggestions {
  prompts: Array<{ prompt: string }>;
}

/* Metabot v3 - Configuration Types */

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
