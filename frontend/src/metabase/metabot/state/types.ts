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

// Mirrors the BE `error-part` shape (after JSON decode) — the FE doesn't
// surface any of these fields directly to end users.
export type MetabotAgentTurnError = {
  message?: string;
  type?: string;
  data?: unknown;
};

// Set on agent messages by the BE so the FE can distinguish completed turns
// (`finished: true`, no `error`) from aborted ones (`finished: false`) and
// errored ones (`error` set).
type AgentTurnStatus = {
  finished?: boolean;
  error?: MetabotAgentTurnError | null;
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

export type MetabotAgentTextChatMessage = AgentTurnStatus & {
  id: string;
  role: "agent";
  type: "text";
  message: string;
  externalId?: string;
};

export type MetabotAgentDataPartMessage = AgentTurnStatus & {
  id: string;
  role: "agent";
  type: "data_part";
  part: MetabotDataPart;
  metadata?: MetabotDataPartMetadata;
  externalId?: string;
};

export type MetabotDebugToolCallMessage = AgentTurnStatus & {
  id: string;
  role: "agent";
  type: "tool_call";
  name: string;
  args?: string;
  status: "started" | "ended";
  result?: string;
  is_error?: boolean;
};

export type MetabotAgentChatMessage =
  | MetabotAgentTextChatMessage
  | MetabotAgentDataPartMessage
  | MetabotDebugToolCallMessage;

export type MetabotUserChatMessage =
  | MetabotUserTextChatMessage
  | MetabotUserActionChatMessage;

export type MetabotDebugChatMessage = MetabotDebugToolCallMessage;

export type MetabotChatMessage =
  | MetabotUserChatMessage
  | MetabotAgentChatMessage
  | MetabotDebugChatMessage;

export type MetabotErrorMessage =
  | {
      type: "message" | "alert";
      message: string;
    }
  | {
      type: "locked";
      message: string;
    };

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
  errorMessages: MetabotErrorMessage[];
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
