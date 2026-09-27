import type { MetabotProfileId } from "metabase/metabot/constants";
import type { ParentedMessage } from "metabase/metabot/utils/message-tree";
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

export const CONVERSATION_REVIEW_LABELS = ["ok", "friction", "failed"] as const;
export type ConversationReviewLabel =
  (typeof CONVERSATION_REVIEW_LABELS)[number];

export const CONVERSATION_ISSUES = [
  "system-failure",
  "unfulfilled",
  "degraded-delivery",
  "overall-refusal",
  "did-not-follow-request",
  "took-incorrect-actions",
  "incomplete-response",
  "high-frustration",
  "impossible-request",
  "vague-request",
] as const;
export type ConversationIssue = (typeof CONVERSATION_ISSUES)[number];

export type ConversationSummary = {
  conversation_id: string;
  created_at: string;
  user_id: number;
  title: string | null;
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
  total_tokens: number;
  cache_read_tokens: number;
  last_message_at: string | null;
  profile_id: MetabotProfileId | null;
  search_count: number;
  query_count: number;
  ip_address: string | null;
  embedding_hostname: string | null;
  embedding_path: string | null;
  user_agent: string | null;
  sanitized_user_agent: string | null;
  forked_from_conversation_id: string | null;
  user: MetabotUserInfo | null;
  review_label: ConversationReviewLabel | null;
  review_issues: ConversationIssue[];
  review_pending: boolean;
};

export const CONVERSATION_SORT_COLUMNS = [
  "created_at",
  "title",
  "message_count",
  "total_tokens",
  "cache_read_tokens",
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
  has_issues?: boolean;
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
  title: string | null;
  user: MetabotUserInfo | null;
  message_count: number;
  total_tokens: number;
  profile_id: MetabotProfileId | null;
  slack_permalink: string | null;
  messages: ParentedMessage[];
  queries: GeneratedQuery[];
  search_count: number;
  query_count: number;
  ip_address: string | null;
  embedding_hostname: string | null;
  embedding_path: string | null;
  user_agent: string | null;
  sanitized_user_agent: string | null;
  forked_from_conversation_id: string | null;
  fork_boundary_message_id: string | null;
  feedback: ConversationFeedback[];
  review: ConversationReview | null;
};

export type ChoiceAnswer = { choice: string; confidence: number };
export type ScoreAnswer = { score: number; confidence: number };

export type ConversationReviewTurn = {
  index: number;
  reaction?: ChoiceAnswer;
  tone?: ScoreAnswer;
};

export type ConversationReviewAnswers = {
  turns?: ConversationReviewTurn[];
  conversation?: {
    outcome?: ChoiceAnswer;
    ending?: ChoiceAnswer;
    frustration?: ScoreAnswer;
  };
};

export type ConversationReview = {
  label: ConversationReviewLabel;
  issues: ConversationIssue[];
  review: boolean;
  answers: ConversationReviewAnswers | null;
  version: string;
  updated_at: string;
};

export const DATA_COMPLEXITY_CATALOG_IDS = [
  "library",
  "universe",
  "metabot",
] as const;

export const DATA_COMPLEXITY_GROUP_IDS = ["size", "ambiguity"] as const;

export type DataComplexityRating = "low" | "medium" | "high";
export type DataComplexityCatalogId =
  (typeof DATA_COMPLEXITY_CATALOG_IDS)[number];
export type DataComplexityGroupId = (typeof DATA_COMPLEXITY_GROUP_IDS)[number];

export type DataComplexitySizeComponentId = "entity_count" | "field_count";
export type DataComplexityAmbiguityComponentId =
  | "name_collisions"
  | "synonym_pairs"
  | "repeated_measures";
export type DataComplexityComponentId =
  | DataComplexitySizeComponentId
  | DataComplexityAmbiguityComponentId;
type DataComplexityGroupComponents = {
  size: DataComplexitySizeComponentId;
  ambiguity: DataComplexityAmbiguityComponentId;
};

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

export type DataComplexitySubScore = DataComplexityFailure | DataComplexityLeaf;

export type DataComplexityCatalog = (ScoreAndRating | ScoreAndRatingError) & {
  components: {
    [G in DataComplexityGroupId]: (ScoreAndRating | ScoreAndRatingError) & {
      components: Record<
        DataComplexityGroupComponents[G],
        DataComplexitySubScore
      >;
    };
  };
};

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
