import type {
  KnownDataPart,
  SearchResultItem,
} from "metabase/api/ai-streaming/schemas";
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
>;

// Search results are rendered under their search step in the chain of thought,
// not as a standalone data-part message.
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
  externalId?: string;
};

export type MetabotAgentTextChatMessage = {
  id: string;
  role: "agent";
  type: "text";
  message: string;
  externalId?: string;
};

export type MetabotAgentDataPartMessage = {
  id: string;
  role: "agent";
  type: "data_part";
  part: MetabotDataPart;
  metadata?: MetabotDataPartMetadata;
  externalId?: string;
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

export type MetabotAgentTurnAbortedMessage = {
  id: string;
  role: "agent";
  type: "turn_aborted";
  externalId?: string;
};

export type MetabotAgentTurnDisplayError = {
  type: "alert" | "locked" | "message";
  message: string;
};

export type MetabotAgentTurnErroredMessage = {
  id: string;
  role: "agent";
  type: "turn_errored";
  error: MetabotAgentTurnError;
  display?: MetabotAgentTurnDisplayError;
  externalId?: string;
};

export type MetabotAgentTurnInProgressMessage = {
  id: string;
  role: "agent";
  type: "turn_in_progress";
  externalId?: string;
};

// The turn's reasoning + tool activity, in chronological order. Held in the
// message list so it renders inline and persists after the turn, but
// client-only: never sent to the model or saved server-side.
export type MetabotAgentChainOfThoughtMessage = {
  id: string;
  role: "agent";
  type: "chain_of_thought";
  steps: MetabotChainStep[];
  // wall-clock span of the reasoning/tool phase, for the "Thought for Ns" label.
  // endedAtMs advances with each step (and settles at the answer), so the span is
  // always recomputable from redux — it survives leaving and returning to the page.
  startedAtMs?: number;
  endedAtMs?: number;
  externalId?: string;
};

export type MetabotAgentChatMessage =
  | MetabotAgentTextChatMessage
  | MetabotAgentDataPartMessage
  | MetabotDebugToolCallMessage
  | MetabotAgentChainOfThoughtMessage
  | MetabotAgentTurnAbortedMessage
  | MetabotAgentTurnErroredMessage
  | MetabotAgentTurnInProgressMessage;

export type MetabotUserChatMessage = MetabotUserTextChatMessage;

export type MetabotDebugChatMessage = MetabotDebugToolCallMessage;

export type MetabotChatMessage =
  | MetabotUserChatMessage
  | MetabotAgentChatMessage
  | MetabotDebugChatMessage;

export type MetabotToolCall = {
  id: string;
  name: string;
  message: string | undefined;
  status: "started" | "ended";
};

// A step in the turn's chain of thought: streamed provider reasoning or a tool
// invocation. Rendered as one interleaved, collapsible timeline.
export type MetabotChainStep =
  | { kind: "reasoning"; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      title?: string;
      searchResults?: MetabotSearchResults;
      status: "started" | "ended";
    };

export type MetabotReactionsState = {
  navigateToPath: string | null;
  suggestedCodeEdits: Partial<
    Record<MetabotCodeEdit["buffer_id"], MetabotCodeEdit>
  >;
  suggestedTransforms: MetabotSuggestedTransform[];
};

export interface MetabotConverstationState {
  conversationId: string;
  loadId: string;
  title: string | undefined;
  isProcessing: boolean;
  messages: MetabotChatMessage[];
  visible: boolean;
  state: MetabotStateContext;
  stateBeforeTurn?: MetabotStateContext;
  activeToolCalls: MetabotToolCall[];
  // id of the current turn's chain_of_thought message while it's still
  // accumulating steps; undefined between turns
  activeChainId: string | undefined;
  profileOverride: MetabotProfileId | undefined;
  pendingMessageExternalId: string | undefined;
  experimental: {
    developerMessage: string;
    metabotReqIdOverride: string | undefined;
  };
}

export const fixedMetabotAgentIds = ["omnibot", "sql", "ask"] as const;
type FixedMetabotAgentId = (typeof fixedMetabotAgentIds)[number];

export type MetabotAgentId = FixedMetabotAgentId | `test_${number}`;

export interface MetabotState {
  conversations: Record<MetabotAgentId, MetabotConverstationState | undefined>;
  reactions: MetabotReactionsState;
  titlePollingConversationIds: string[];
  debugMode: boolean;
  savedChartCardIds: Record<string, number>;
}

export interface SlashCommand {
  cmd: string;
  args: string[];
}
