import type React from "react";

import type { InteractiveQuestionProps } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import type { StaticQuestionProps } from "embedding-sdk-bundle/components/public/StaticQuestion";
import type { MetabotTodoItem } from "metabase-types/api";

// User messages

type MetabotUserTextMessage = {
  id: string;
  role: "user";
  type: "text";
  message: string;
};

type MetabotUserActionMessage = {
  id: string;
  role: "user";
  type: "action";
  message: string;
  /** Human-readable label for the action (e.g. "Run Query") */
  actionLabel: string;
};

type MetabotUserMessage = MetabotUserTextMessage | MetabotUserActionMessage;

// Agent messages

type MetabotAgentTextMessage = {
  id: string;
  role: "agent";
  type: "text";
  message: string;
};

type MetabotAgentTodoListMessage = {
  id: string;
  role: "agent";
  type: "todo_list";
  payload: MetabotTodoItem[];
};

type MetabotAgentEditSuggestionMessage = {
  id: string;
  role: "agent";
  type: "edit_suggestion";
  // Mapped from internal `suggestedTransform`; complex fields are intentionally excluded.
  payload: {
    name: string;
    description: string;
  };
};

// NOTE: the internal `tool_call` agent variant is intentionally omitted here.
// It is a debug-only message surfaced via metabot's `debugMode`, which the SDK
// does not expose. `use-metabot.tsx` filters tool_call out before mapping.
type MetabotAgentMessage =
  | MetabotAgentTextMessage
  | MetabotAgentTodoListMessage
  | MetabotAgentEditSuggestionMessage;

export type MetabotMessage = MetabotUserMessage | MetabotAgentMessage;

export type MetabotChartProps =
  | (Omit<StaticQuestionProps, "questionId" | "token" | "query"> & {
      drills?: false;
    })
  | (Omit<InteractiveQuestionProps, "questionId" | "token" | "query"> & {
      drills: true;
    });

export type MetabotErrorMessage = {
  /** `"alert"` renders with a warning icon and error color; `"message"` renders as plain text. */
  type: "message" | "alert";
  message: string;
};

export type UseMetabotResult = {
  /** Submit a new message to the conversation. */
  submitMessage: (message: string) => Promise<void>;
  /**
   * Rewinds the conversation to the user message preceding `messageId` and re-submits
   * that prompt. The agent message at `messageId` and anything after it is dropped.
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
   * A pre-wired component bound to the latest `navigate_to` path.
   * Suitable for sidebar/panel layouts. Renders nothing until the agent
   * sends a chart.
   */
  CurrentChart: React.ComponentType<MetabotChartProps>;
};
