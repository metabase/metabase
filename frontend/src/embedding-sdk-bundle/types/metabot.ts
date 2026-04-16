import type React from "react";

import type { InteractiveQuestionProps } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import type { StaticQuestionProps } from "embedding-sdk-bundle/components/public/StaticQuestion";
import type { MetabotTodoItem } from "metabase-types/api";

export type { MetabotTodoItem };

// User messages

export type MetabotUserTextMessage = {
  id: string;
  role: "user";
  type: "text";
  message: string;
};

export type MetabotUserActionMessage = {
  id: string;
  role: "user";
  type: "action";
  message: string;
  /** Human-readable label for the action (e.g. "Run Query") */
  actionLabel: string;
};

export type MetabotUserMessage =
  | MetabotUserTextMessage
  | MetabotUserActionMessage;

// Agent messages

export type MetabotAgentTextMessage = {
  id: string;
  role: "agent";
  type: "text";
  message: string;
};

export type MetabotAgentChartMessage = {
  id: string;
  role: "agent";
  type: "chart";
  /** URL path to the question, e.g. `/question/123` */
  questionPath: string;
};

export type MetabotAgentTodoListMessage = {
  id: string;
  role: "agent";
  type: "todo_list";
  payload: MetabotTodoItem[];
};

export type MetabotAgentEditSuggestionMessage = {
  id: string;
  role: "agent";
  type: "edit_suggestion";
  /** Mapped from internal `suggestedTransform`; complex fields are intentionally excluded. */
  payload: {
    name: string;
    description: string;
  };
};

export type MetabotAgentToolCallMessage = {
  id: string;
  role: "agent";
  type: "tool_call";
  name: string;
  status: "started" | "ended";
  // Internal debug fields (args, result, is_error) are intentionally excluded.
};

// NOTE: new `type` values may be added in future releases.
// Always handle unknown types with a default/fallback case in switch statements.

export type MetabotAgentMessage =
  | MetabotAgentTextMessage
  | MetabotAgentChartMessage
  | MetabotAgentTodoListMessage
  | MetabotAgentEditSuggestionMessage
  | MetabotAgentToolCallMessage;

export type MetabotMessage = MetabotUserMessage | MetabotAgentMessage;

export type MetabotChartProps =
  | (Omit<StaticQuestionProps, "questionId" | "token" | "query"> & {
      drills?: false;
    })
  | (Omit<InteractiveQuestionProps, "questionId" | "token" | "query"> & {
      drills: true;
    });

export type MetabotErrorMessage = {
  /** `"alert"` is for critical errors that should interrupt the user; `"message"` is for inline informational errors. */
  type: "message" | "alert";
  message: string;
};

export type UseMetabotResult = {
  /** Submit a new message to the conversation. */
  submitMessage: (message: string) => Promise<void>;
  /**
   * Rewinds the conversation to the user message preceding `messageId` and re-submits.
   * There is no per-message failure state — show a retry button on all agent messages,
   * or show a global retry when `errorMessages` is non-empty.
   */
  retryMessage: (messageId: string) => Promise<void>;
  /** Cancel the current in-flight request. */
  cancelRequest: () => void;
  /** Clear all messages and start fresh. */
  resetConversation: () => void;

  /** All messages in the conversation. */
  messages: MetabotMessage[];
  /** Errors are conversation-level, not attached to individual messages. */
  errorMessages: MetabotErrorMessage[];
  isProcessing: boolean;
  /**
   * True when the conversation is approaching the context window limit.
   * Consider showing a warning and offering resetConversation() to the user.
   */
  isLongConversation: boolean;

  /**
   * A pre-wired component bound to the latest `navigate_to` path.
   * Suitable for sidebar/panel layouts. `null` until the agent sends a chart.
   */
  currentChart: React.ComponentType<MetabotChartProps> | null;

  customInstructions: string | undefined;
  setCustomInstructions: (instructions: string | undefined) => void;
};
