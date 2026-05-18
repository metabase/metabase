import type { MetabotProfileId } from "metabase/metabot/constants";
import type { FetchedChatMessage } from "metabase/metabot/utils/normalize-fetched-chat-messages";
import type {
  DatasetQuery,
  MetabotFeedback,
  VisualizationDisplay,
} from "metabase-types/api";

export type MetabotUserInfo = {
  id: number;
  email?: string;
  first_name?: string | null;
  last_name?: string | null;
  tenant_id: number | null;
};

export type ConversationSummary = {
  conversation_id: string;
  created_at: string;
  user_id: number;
  summary: string | null;
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
  total_tokens: number;
  last_message_at: string | null;
  profile_id: MetabotProfileId | null;
  search_count: number;
  query_count: number;
  ip_address: string | null;
  embedding_hostname: string | null;
  embedding_path: string | null;
  user_agent: string | null;
  sanitized_user_agent: string | null;
  user: MetabotUserInfo | null;
};

export const CONVERSATION_SORT_COLUMNS = [
  "created_at",
  "message_count",
  "total_tokens",
  "user",
  "profile_id",
  "ip_address",
] as const;

export type ConversationSortColumn = (typeof CONVERSATION_SORT_COLUMNS)[number];

export type ConversationsRequest = {
  limit?: number;
  offset?: number;
  user_id?: number;
  group_id?: number;
  tenant_id?: number;
  date?: string;
  sort_by?: ConversationSortColumn;
  sort_dir?: "asc" | "desc";
};

export type ConversationsResponse = {
  data: ConversationSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type GeneratedQuery = {
  tool: string;
  call_id: string | null;
  message_id: number;
  query_id: string | null;
  query_type: "sql" | "notebook";
  sql: string | null;
  mbql: DatasetQuery | null;
  display: VisualizationDisplay | null;
  database_id: number | null;
  tables: string[];
};

export type ConversationFeedback = MetabotFeedback & {
  id: number;
  user_id: number;
  user?: MetabotUserInfo | null;
  external_id: string | null;
};

export type ConversationDetail = {
  conversation_id: string;
  created_at: string;
  summary: string | null;
  user: MetabotUserInfo | null;
  message_count: number;
  total_tokens: number;
  profile_id: MetabotProfileId | null;
  slack_permalink: string | null;
  chat_messages: FetchedChatMessage[];
  queries: GeneratedQuery[];
  search_count: number;
  query_count: number;
  ip_address: string | null;
  embedding_hostname: string | null;
  embedding_path: string | null;
  user_agent: string | null;
  sanitized_user_agent: string | null;
  feedback: ConversationFeedback[];
};

export type DataComplexityRating = "low" | "medium" | "high";
export type DataComplexityCatalogId = "library" | "universe" | "metabot";
export type DataComplexityGroupId = "size" | "ambiguity";

export type DataComplexitySizeComponentId = "entity_count" | "field_count";
export type DataComplexityAmbiguityComponentId =
  | "name_collisions"
  | "synonym_pairs"
  | "repeated_measures";
export type DataComplexityComponentId =
  | DataComplexitySizeComponentId
  | DataComplexityAmbiguityComponentId;

export type DataComplexityFailure = { error: string };
export type ScoreAndRating = {
  score: number;
  rating: DataComplexityRating | null;
  rating_label: string | null;
};

export type ScoreAndRatingError = {
  [K in keyof ScoreAndRating]: null;
};

export type DataComplexityLeaf = {
  measurement: number;
} & ScoreAndRating;

interface DataComplexitySchemaNode {
  [key: string]: DataComplexitySchemaNode | true;
}

type DataComplexityCatalogSchema = {
  size: {
    entity_count: true;
    field_count: true;
  };
  ambiguity: {
    name_collisions: true;
    synonym_pairs: true;
    repeated_measures: true;
  };
};

export type DataComplexityGrouping<T extends DataComplexitySchemaNode> = (
  | ScoreAndRating
  | ScoreAndRatingError
) & {
  components: {
    [K in keyof T]: T[K] extends true
      ? DataComplexitySubScore
      : T[K] extends DataComplexitySchemaNode
        ? DataComplexityGrouping<T[K]>
        : never;
  };
};

export type DataComplexitySubScore = DataComplexityFailure | DataComplexityLeaf;

export type DataComplexitySizeGroup = DataComplexityGrouping<
  DataComplexityCatalogSchema["size"]
>;

export type DataComplexityAmbiguityGroup = DataComplexityGrouping<
  DataComplexityCatalogSchema["ambiguity"]
>;

export type DataComplexityGroup =
  | DataComplexitySizeGroup
  | DataComplexityAmbiguityGroup;

export type DataComplexityCatalog =
  DataComplexityGrouping<DataComplexityCatalogSchema>;

export type DataComplexityScoresResponse = {
  meta: {
    formula_version: number;
    format_version: number;
    synonym_threshold: number;
    calculated_at?: string;
    embedding_model?: {
      provider: string;
      model_name: string;
    } | null;
  };
} & {
  [K in DataComplexityCatalogId]: DataComplexityCatalog;
};
