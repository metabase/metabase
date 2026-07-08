import type React from "react";

import type { InteractiveQuestionProps } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import type { StaticQuestionProps } from "embedding-sdk-bundle/components/public/StaticQuestion";

// User messages

export type MetabotUserTextMessage = {
  id: string;
  role: "user";
  type: "text";
  message: string;
};

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
  /** URL path to the question, e.g. `/question#<base64>` */
  questionPath: string;
  /** A pre-wired React component that renders the chart. */
  Chart: React.ComponentType<MetabotChartProps>;
};

// Internal variants intentionally omitted. `use-metabot.tsx` only exposes
// `type === "text"` messages `:
// - `tool_call` messages: debug-only, gated on metabot's `debugMode`.
// - `action` user messages: produced only when replaying historical audit conversations,
//   never via the SDK input path.
// - `data_part` messages other than `navigate_to` (`code_edit`, `transform_suggestion`,
//   `todo_list`, `adhoc_viz`, `static_viz`, `state`): in-app surfaces (Transform editor,
//   codegen profiles) the SDK does not render.
export type MetabotAgentMessage =
  | MetabotAgentTextMessage
  | MetabotAgentChartMessage;

/** @category useMetabot */
export type MetabotMessage = MetabotUserTextMessage | MetabotAgentMessage;

/** @category useMetabot */
export type MetabotChartProps =
  | (Omit<StaticQuestionProps, "questionId" | "token" | "query"> & {
      drills?: false;
    })
  | (Omit<InteractiveQuestionProps, "questionId" | "token" | "query"> & {
      drills: true;
    });

/** @category useMetabot */
export type MetabotErrorMessage = {
  /** `"alert"` renders with a warning icon and error color; `"message"` renders as plain text. */
  type: "message" | "alert" | "locked";
  message: string;
};

/** @category useMetabot */
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

  /** All messages in the conversation. Chart messages include a `Chart` property. */
  messages: MetabotMessage[];
  /** Errors are conversation-level, not attached to individual messages. */
  errorMessages: MetabotErrorMessage[];
  /**
   * `true` from the moment a message is submitted until the response
   * completes — including success, error, or cancellation.
   */
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
