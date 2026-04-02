export type MetabotSummary = {
  total_conversations: number;
  total_messages: number;
  total_tokens: number;
  unique_users: number;
  conversations_last_30_days: number;
  tokens_last_30_days: number;
};

export type MetabotUserInfo = {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
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
  model: string | null;
  user: MetabotUserInfo | null;
};

export type ConversationSortColumn =
  | "created_at"
  | "message_count"
  | "total_tokens";

export type ConversationsRequest = {
  limit?: number;
  offset?: number;
  "user-id"?: number;
  "sort-by"?: ConversationSortColumn;
  "sort-dir"?: "asc" | "desc";
};

export type ConversationsResponse = {
  data: ConversationSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type MessageDetail = {
  message_id: number;
  created_at: string;
  role: "user" | "assistant";
  model: string | null;
  total_tokens: number | null;
  data: unknown;
};

export type ConversationDetail = {
  conversation_id: string;
  created_at: string;
  user_id: number;
  summary: string | null;
  state: unknown;
  user: MetabotUserInfo | null;
  messages: MessageDetail[];
};

export type UsageDataPoint = {
  usage_date: string;
  model: string | null;
  conversation_count: number;
  unique_users: number;
  user_messages: number;
  assistant_messages: number;
  total_tokens: number;
};
