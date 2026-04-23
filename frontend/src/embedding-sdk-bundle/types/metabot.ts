import type React from "react";

import type { InteractiveQuestionProps } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import type { StaticQuestionProps } from "embedding-sdk-bundle/components/public/StaticQuestion";

// User messages

type MetabotUserTextMessage = {
  id: string;
  role: "user";
  type: "text";
  message: string;
};

// Agent messages

type MetabotAgentTextMessage = {
  id: string;
  role: "agent";
  type: "text";
  message: string;
};

// Internal variants intentionally omitted. `use-metabot.tsx` filters these out before mapping:
// - `tool_call`: debug-only, gated on metabot's `debugMode`.
// - `edit_suggestion`: targets the in-app Transform editor, which the SDK does not render.
// - `action`: unused in shipped code.
// - `todo_list`: only reachable via the `codegen/transforms` profile, not the SDK.
type MetabotAgentMessage = MetabotAgentTextMessage;

export type MetabotMessage = MetabotUserTextMessage | MetabotAgentMessage;

export type MetabotChartProps =
  | (Omit<StaticQuestionProps, "questionId" | "token" | "query"> & {
      drills?: false;
    })
  | (Omit<InteractiveQuestionProps, "questionId" | "token" | "query"> & {
      drills: true;
    });

export type MetabotErrorMessage = {
  /** `"alert"` renders with a warning icon and error color; `"message"` renders as plain text. */
  type: "message" | "alert" | "locked";
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
   * `null` until the agent sends a chart — lets consumers detect presence
   * and render a placeholder or swap panel content only when set.
   *
   * @example
   * {CurrentChart ? <CurrentChart /> : <Placeholder />}
   */
  CurrentChart: React.ComponentType<MetabotChartProps> | null;
};
