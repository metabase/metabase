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

export const DATA_COMPLEXITY_CATALOG_IDS = [
  "library",
  "universe",
  "metabot",
] as const;

export type DataComplexityRating = "low" | "medium" | "high";
export type DataComplexityCatalogId =
  (typeof DATA_COMPLEXITY_CATALOG_IDS)[number];

// The score tree is recursive and open: a node is a failure, a scored leaf, or a grouping whose
// `components` may nest arbitrarily deep (e.g. the synonym-degree sub-group). The backend can add
// or rename measures without breaking the client — the renderer walks the tree generically and
// labels nodes by key. `rating`/`rating_label` are only populated where rating bands apply
// (currently the catalog total) and are null elsewhere.

// A failed sub-score (e.g. an embedder outage): carries the message and a null score that cascades.
export type DataComplexityFailure = {
  error: string;
  score?: null;
};

// A scored leaf. `score`/`measurement` may be fractional (ratios, coverage gaps, graph analytics),
// and `score` is null when it cascaded from a failure.
export type DataComplexityLeaf = {
  measurement: number;
  score: number | null;
  rating?: DataComplexityRating | null;
  rating_label?: string | null;
};

// An internal grouping node. `score` is the rollup of its scored descendants, or absent/null when
// scoring was skipped (level 0) or cascaded from a failure.
export type DataComplexityGroup = {
  score?: number | null;
  rating?: DataComplexityRating | null;
  rating_label?: string | null;
  components: Record<string, DataComplexityNode>;
};

export type DataComplexityNode =
  | DataComplexityFailure
  | DataComplexityLeaf
  | DataComplexityGroup;

export type DataComplexityScoresResponse = {
  meta: {
    formula_version: number;
    format_version: number;
    synonym_threshold: number;
    level?: number;
    calculated_at?: string;
    embedding_model?: {
      provider: string;
      model_name: string;
    } | null;
  };
} & {
  [K in DataComplexityCatalogId]: DataComplexityGroup;
};
