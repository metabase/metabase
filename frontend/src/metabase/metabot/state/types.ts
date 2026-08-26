import type {
  KnownDataPart,
  SearchResultItem,
} from "metabase/api/ai-streaming/schemas";
import type { FinishReason } from "metabase/api/ai-streaming/sse-types";
import type { MetabotProfileId } from "metabase/metabot/constants";
import type {
  MetabotCodeEdit,
  MetabotCodeEditorBufferContext,
  MetabotStateContext,
  MetabotSuggestedTransform,
  MetabotTransformInfo,
} from "metabase-types/api";

export type MetabotDataPart = Exclude<
  KnownDataPart,
  | { type: "data-state" }
  | { type: "data-conversation-title" }
  | { type: "data-search_results" }
  | { type: "data-tool_title" }
>;

export type MetabotSearchResults = {
  totalCount: number;
  results: SearchResultItem[];
};

export type MetabotDataPartMetadata = {
  codeEditBuffer?: MetabotCodeEditorBufferContext;
  editorTransform?: MetabotTransformInfo;
  suggestionId?: string;
};

export type MetabotAgentTurnError = {
  message?: string;
  type?: string;
  data?: unknown;
};

export type MetabotUserTextChatMessage = {
  id: string;
  role: "user";
  type: "text";
  message: string;
};

export type MetabotAgentTextChatMessage = {
  id: string;
  role: "agent";
  type: "text";
  message: string;
};

export type MetabotAgentDataPartMessage = {
  id: string;
  role: "agent";
  type: "data_part";
  part: MetabotDataPart;
  metadata?: MetabotDataPartMetadata;
};

export type MetabotDebugToolCallMessage = {
  id: string;
  role: "agent";
  type: "tool_call";
  name: string;
  args?: string;
  status: "started" | "ended";
  result?: string;
  is_error?: boolean;
};

export type MetabotAgentTurnDisplayError = {
  type: "alert" | "locked" | "message";
  message: string;
};

export type MetabotAgentChainOfThoughtMessage = {
  id: string;
  role: "agent";
  type: "chain_of_thought";
  steps: MetabotChainStep[];
  finished: boolean;
  startedAtMs?: number;
  endedAtMs?: number;
};

export type MetabotUserChatMessage = MetabotUserTextChatMessage;

export type MetabotIncompleteFinishReason = Exclude<
  FinishReason,
  "stop" | "error"
>;

export type MetabotMessageStatus =
  | { type: "streaming" }
  | { type: "in_progress" }
  | { type: "done" }
  | { type: "aborted" }
  | {
      type: "incomplete";
      finishReason: MetabotIncompleteFinishReason;
      contextWindowFull?: boolean;
    }
  | {
      type: "errored";
      error: MetabotAgentTurnError;
      display?: MetabotAgentTurnDisplayError;
    };

export type MetabotMessagePart =
  | MetabotUserTextChatMessage
  | MetabotAgentTextChatMessage
  | MetabotAgentDataPartMessage
  | MetabotDebugToolCallMessage
  | MetabotAgentChainOfThoughtMessage;

export type MetabotMessage = {
  id: string;
  externalId?: string;
  role: "user" | "agent";
  parts: MetabotMessagePart[];
  status: MetabotMessageStatus;
};

export type MetabotToolCall = {
  id: string;
  name: string;
  message: string | undefined;
  status: "started" | "ended";
};

export type MetabotChainStep =
  | { kind: "reasoning"; text: string; startedAtMs?: number }
  | {
      kind: "tool";
      id: string;
      name: string;
      title?: string;
      searchResults?: MetabotSearchResults;
      status: "started" | "ended";
      startedAtMs?: number;
    };

export type MetabotReactionsState = {
  navigateToPath: string | null;
  suggestedCodeEdits: Partial<
    Record<MetabotCodeEdit["buffer_id"], MetabotCodeEdit>
  >;
  suggestedTransforms: MetabotSuggestedTransform[];
};

export type MetabotContextUsage = {
  contextTokens: number;
  contextWindowTokens: number;
};

export interface MetabotConversationState {
  conversationId: string;
  title: string | undefined;
  forkedFromConversationId: string | undefined;
  isProcessing: boolean;
  hasMessagedInSession: boolean;
  loadId: number;
  messages: MetabotMessage[];
  state: MetabotStateContext;
  stateBeforeTurn?: MetabotStateContext;
  activeToolCalls: MetabotToolCall[];
  lastTokenUsage?: MetabotContextUsage;
  profileOverride: MetabotProfileId | undefined;
  experimental: {
    developerMessage: string;
    metabotReqIdOverride: string | undefined;
  };
}

export interface MetabotAgentState {
  conversationId: string;
  visible: boolean;
}

export const fixedMetabotAgentIds = [
  "omnibot",
  "sql",
  "ask",
  "explorations",
] as const;
type FixedMetabotAgentId = (typeof fixedMetabotAgentIds)[number];

export type MetabotAgentId = FixedMetabotAgentId | `test_${number}`;

export interface MetabotState {
  conversations: Record<string, MetabotConversationState | undefined>;
  agents: Partial<Record<MetabotAgentId, MetabotAgentState>>;
  reactions: MetabotReactionsState;
  titlePollingConversationIds: string[];
  debugMode: boolean;
  savedChartCardIds: Record<string, number>;
}

export interface SlashCommand {
  cmd: string;
  args: string[];
}
