import type {
  CardDisplayType,
  CardId,
  CardType,
  CollectionId,
  DashboardId,
  DatasetQuery,
  PaginationResponse,
  RowValue,
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

export type MetabotMessageReaction = {
  type: "metabot.reaction/message";
  message: string;
};

export type MetabotRedirectReaction = {
  type: "metabot.reaction/redirect";
  url: string;
};

export type MetabotReaction = MetabotMessageReaction | MetabotRedirectReaction;

export type MetabotColumnType =
  | "number"
  | "string"
  | "date"
  | "datetime"
  | "time"
  | "boolean"
  | "null";
export type MetabotColumnInfo = {
  name: string;
  type?: MetabotColumnType;
};

export type MetabotSeriesConfig = {
  x: MetabotColumnInfo;
  y?: MetabotColumnInfo;
  x_values?: RowValue[];
  y_values?: RowValue[];
  display_name: string;
  chart_type: CardDisplayType;
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
    timestamp: string;
  }>;
  query?: DatasetQuery;
  display_type?: CardDisplayType;
};

export type MetabotCardInfo = {
  type: CardType;
  id: CardId;
  chart_configs?: Array<MetabotChartConfig>;
  query?: DatasetQuery;
  error?: any;
};

export type MetabotDashboardInfo = {
  type: "dashboard";
  id: DashboardId;
};

export type MetabotAdhocQueryInfo = {
  type: "adhoc";
  chart_configs?: Array<MetabotChartConfig>;
  query?: DatasetQuery;
  error?: any;
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
  state: MetabotStateContext;
  conversation_id: string; // uuid
  metabot_id?: string;
};

export type MetabotAgentResponse = {
  reactions: MetabotReaction[];
  history: MetabotHistory[];
  conversation_id: string;
  state: any;
};

/* Metabot - Suggested Prompts */

export type SuggestedMetabotPrompt = {
  id: number;
  metabot_id: MetabotId;
  prompt: string;
  model: "metric" | "model";
  model_id: CardId;
  model_name: string;
  created_at: string;
  updated_at: string;
};

type BaseSuggestedMetabotPromptsRequest = {
  metabot_id: MetabotId;
  model?: string;
  model_id?: number;
};

export type SuggestedMetabotPromptsRequest =
  BaseSuggestedMetabotPromptsRequest & {
    metabot_id: MetabotId;
    model?: string;
    model_id?: number;
  } & (
      | { sample?: void; limit?: number | null; offset?: number | null }
      | { sample: true; limit?: number | null; offset?: void }
    );

export type SuggestedMetabotPromptsResponse = {
  prompts: SuggestedMetabotPrompt[];
} & PaginationResponse;

export type DeleteSuggestedMetabotPromptRequest = {
  metabot_id: MetabotId;
  prompt_id: SuggestedMetabotPrompt["id"];
};

/* Metabot v3 - Entity Types */

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
