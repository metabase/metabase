import type { KnownDataPart } from "metabase/api/ai-streaming/schemas";
import type { MetabotProfileId } from "metabase/metabot/constants";
import type {
  MetabotCodeEdit,
  MetabotCodeEditorBufferContext,
  MetabotHistory,
  MetabotSuggestedTransform,
  MetabotTransformInfo,
} from "metabase-types/api";

export type MetabotDataPart = Exclude<KnownDataPart, { type: "state" }>;

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

export type MetabotUserActionChatMessage = {
  id: string;
  role: "user";
  type: "action";
  message: string;
  userMessage: string;
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

export type MetabotAgentChatMessage =
  | MetabotAgentTextChatMessage
  | MetabotAgentDataPartMessage
  | MetabotDebugToolCallMessage
  | MetabotAgentTurnAbortedMessage
  | MetabotAgentTurnErroredMessage;

export type MetabotUserChatMessage =
  | MetabotUserTextChatMessage
  | MetabotUserActionChatMessage;

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

export type MetabotReactionsState = {
  navigateToPath: string | null;
  suggestedCodeEdits: Partial<
    Record<MetabotCodeEdit["buffer_id"], MetabotCodeEdit>
  >;
  suggestedTransforms: MetabotSuggestedTransform[];
};

export interface MetabotConverstationState {
  conversationId: string;
  isProcessing: boolean;
  messages: MetabotChatMessage[];
  visible: boolean;
  history: MetabotHistory;
  state: any;
  activeToolCalls: MetabotToolCall[];
  profileOverride: MetabotProfileId | undefined;
  pendingMessageExternalId: string | undefined;
  experimental: {
    developerMessage: string;
    metabotReqIdOverride: string | undefined;
  };
}

export const fixedMetabotAgentIds = ["omnibot", "sql"] as const;
type FixedMetabotAgentId = (typeof fixedMetabotAgentIds)[number];

export type MetabotAgentId = FixedMetabotAgentId | `test_${number}`;

export interface MetabotState {
  conversations: Record<MetabotAgentId, MetabotConverstationState | undefined>;
  reactions: MetabotReactionsState;
  debugMode: boolean;
}

export interface SlashCommand {
  cmd: string;
  args: string[];
}
