import type { EnterpriseSharedState } from "metabase-enterprise/shared/reducer";
import type { EnterpriseState } from "metabase-enterprise/shared/types";
import type {
  MetabotCodeEdit,
  MetabotHistory,
  MetabotTodoItem,
  MetabotTransformInfo,
  SuggestedTransform,
} from "metabase-types/api";

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
};

export type MetabotAgentTodoListChatMessage = {
  id: string;
  role: "agent";
  type: "todo_list";
  payload: MetabotTodoItem[];
};

export type MetabotAgentEditSuggestionChatMessage = {
  id: string;
  role: "agent";
  type: "edit_suggestion";
  model: "transform";
  payload: {
    editorTransform: MetabotTransformInfo | undefined;
    suggestedTransform: MetabotSuggestedTransform;
  };
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

export type MetabotAgentChatMessage =
  | MetabotAgentTextChatMessage
  | MetabotAgentTodoListChatMessage
  | MetabotAgentEditSuggestionChatMessage
  | MetabotDebugToolCallMessage;

export type MetabotUserChatMessage =
  | MetabotUserTextChatMessage
  | MetabotUserActionChatMessage;

export type MetabotDebugChatMessage = MetabotDebugToolCallMessage;

export type MetabotChatMessage =
  | MetabotUserChatMessage
  | MetabotAgentChatMessage
  | MetabotDebugChatMessage;

export type MetabotErrorMessage = {
  type: "message" | "alert";
  message: string;
};

export type MetabotToolCall = {
  id: string;
  name: string;
  message: string | undefined;
  status: "started" | "ended";
};

export type MetabotSuggestedTransform = SuggestedTransform & {
  active: boolean;
  suggestionId: string; // internal unique identifier for marking active/inactive
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
  profileOverride: string | undefined;
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

export interface MetabotStoreState extends EnterpriseState {
  plugins: {
    shared: EnterpriseSharedState;
    metabotPlugin: MetabotState;
  };
}

export interface SlashCommand {
  cmd: string;
  args: string[];
}
