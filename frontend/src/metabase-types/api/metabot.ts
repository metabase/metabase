import type {
  CardDisplayType,
  CardId,
  CardType,
  DashboardId,
  DatasetQuery,
  DraftTransform,
  PaginationResponse,
  RowValue,
  SuggestedTransform,
  Transform,
  UnsavedCard,
  Version,
} from ".";

export type MetabotFeedbackType =
  | "great"
  | "wrong_data"
  | "incorrect_result"
  | "invalid_sql";

/* Metabot v3 - Base Types */

export type MetabotCodeEditorBufferContext = {
  id: string;
  source: Record<string, unknown> & {
    language: "sql";
    database_id: number | null;
  };
  cursor: { line: number; column: number };
  selection?: {
    text: string;
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
};

export type MetabotCodeEditorContext = {
  type: "code_editor";
  buffers: MetabotCodeEditorBufferContext[];
};

export type MetabotUserIsViewingContext = Array<
  MetabotEntityInfo | MetabotCodeEditorContext
>;

export type MetabotChatContext = {
  user_is_viewing: MetabotUserIsViewingContext;
  current_time_with_timezone: string;
  default_database_id?: number;
  capabilities: string[];
  code_editor?: MetabotCodeEditorContext;
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

export type MetabotDocumentInfo = {
  type: "document";
  id: number;
};

export type MetabotTransformInfo =
  | ({ type: "transform"; error?: string } & Transform) // edit
  | ({ type: "transform"; error?: string } & SuggestedTransform) // edit saved suggested
  | ({ type: "transform"; error?: string } & DraftTransform); // edit unsaved suggested

export type MetabotEntityInfo =
  | MetabotCardInfo
  | MetabotDashboardInfo
  | MetabotAdhocQueryInfo
  | MetabotDocumentInfo
  | MetabotTransformInfo;

export type MetabotCodeEdit = {
  buffer_id: string;
  mode: "rewrite";
  value: string;
  active?: boolean;
};

/* Metabot v3 - API Request Types */

export type MetabotAgentRequest = {
  message: string;
  context: MetabotChatContext;
  history: MetabotHistory;
  state: MetabotStateContext;
  conversation_id: string; // uuid
  metabot_id?: string;
  profile_id?: string;
};

export type MetabotAgentResponse = {
  history: MetabotHistory[];
  conversation_id: string;
  state: any;
};

export type MetabotProvider =
  | "metabase"
  | "anthropic"
  | "openai"
  | "openrouter";

export interface MetabotSettingsResponse {
  value: string | null;
  "api-key-error"?: string | null;
  models: {
    id: string;
    display_name: string;
    group?: string | null;
  }[];
}

export interface UpdateMetabotSettingsRequest {
  provider: MetabotProvider;
  model?: string;
  "api-key"?: string | null;
}

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

export interface MetabotFeedback {
  metabot_id: MetabotId;
  feedback: {
    positive: boolean;
    message_id: string;
    issue_type?: string | undefined;
    freeform_feedback: string;
  };
  conversation_data: any;
  version: Version;
  submission_time: string;
  is_admin: boolean;
}

/* Metabot v3 - Entity Types */

export type MetabotId = number;
export type MetabotName = string;

export type MetabotInfo = {
  id: MetabotId;
  entity_id: string;
  name: MetabotName;
  description: string;
  use_verified_content: boolean;
  collection_id: number | null;
  created_at: string;
  updated_at: string;
};

/* Metabot v3 - Document Types */

export interface MetabotGenerateContentRequest {
  instructions: string;
  references?: Record<string, string>;
}

export interface MetabotGenerateContentResponse {
  draft_card: (UnsavedCard & { name?: string }) | null;
  description: string;
  error: string | null;
}

/* Metabot v3 - Data Part Types */

export type MetabotTodoItem = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
};

/* Metabot v3 - Slack Settings */

export type MetabotSlackSettings =
  | {
      "slack-connect-client-id": string;
      "slack-connect-client-secret": string;
      "metabot-slack-signing-secret": string;
    }
  | {
      "slack-connect-client-id": null;
      "slack-connect-client-secret": null;
      "metabot-slack-signing-secret": null;
    };

/* Metabot v3 - Group Permissions */

export enum AIToolKey {
  Metabot = "permission/metabot",
  ChatAndNLQ = "permission/metabot-nlq",
  SQLGeneration = "permission/metabot-sql-generation",
  OtherTools = "permission/metabot-other-tools",
}

export type MetabotGroupPermission = {
  group_id: number;
  perm_type: AIToolKey;
  perm_value: "yes" | "no";
};

export type MetabotPermissionsResponse = {
  permissions: MetabotGroupPermission[];
};

export type UpdateMetabotPermissionsRequest = {
  permissions: MetabotGroupPermission[];
};

export type UserMetabotPermissions = {
  metabot: "yes" | "no";
  "metabot-sql-generation": "yes" | "no";
  "metabot-nlq": "yes" | "no";
  "metabot-other-tools": "yes" | "no";
};

export type MetabotUsage = {
  user_usage: number; // tokens: in millions (e.g. 1.5 = 1.5M tokens); messages: integer count
  user_limit: number | null;
  instance_usage: number;
  instance_limit: number | null;
  tenant_usage?: number;
  tenant_limit?: number | null;
  limit_unit: MetabotLimitType;
  limit_reset_rate: MetabotLimitPeriod;
  period_start: string;
};

export type UserMetabotPermissionsResponse = {
  permissions: UserMetabotPermissions;
  usage: MetabotUsage | null;
};

export type MetabotLimitPeriod = "daily" | "weekly" | "monthly";
export type MetabotLimitType = "tokens" | "messages";

/* Metabot v3 - Usage Limits */

export type MetabotInstanceLimit = { max_usage: number | null };
export type MetabotGroupLimit = { group_id: number; max_usage: number };
export type MetabotTenantLimit = {
  tenant_id: number;
  max_usage: number | null;
};
