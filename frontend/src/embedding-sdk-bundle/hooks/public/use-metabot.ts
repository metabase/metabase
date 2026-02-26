import { useCallback, useState } from "react";

import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks/use-metabot-agent";

/**
 * Public-facing hook for interacting with Metabot in the SDK.
 *
 * Provides a simplified API for sending messages, managing conversation state,
 * and reading Metabot responses.
 */
export const useMetabot = () => {
  const agent = useMetabotAgent("omnibot");

  const [customInstructions, setCustomInstructions] = useState<
    string | undefined
  >();

  useRegisterMetabotContextProvider(
    async () =>
      customInstructions
        ? { custom_instructions: customInstructions }
        : undefined,
    [customInstructions],
  );

  const submitMessage = useCallback(
    (message: string) => agent.submitInput(message),
    [agent.submitInput],
  );

  return {
    /** The current user prompt value. */
    prompt: agent.prompt,

    /** Set the current prompt value without submitting. */
    setPrompt: agent.setPrompt,

    /** Whether the Metabot sidebar is visible. */
    visible: agent.visible,

    /** Show or hide the Metabot sidebar. */
    setVisible: agent.setVisible,

    /** Submit a message to Metabot. */
    submitMessage,

    /** Retry a previously failed message by its ID. */
    retryMessage: agent.retryMessage,

    /** Cancel the current in-flight request. */
    cancelRequest: agent.cancelRequest,

    /** Reset the conversation, clearing all messages. */
    resetConversation: agent.resetConversation,

    /** The list of chat messages in the current conversation. */
    messages: agent.messages,

    /** Any error messages from the current conversation. */
    errorMessages: agent.errorMessages,

    /** Whether Metabot is currently processing a request. */
    isProcessing: agent.isDoingScience,

    /** Whether this is a long conversation. */
    isLongConversation: agent.isLongConversation,

    /** Currently active tool calls being processed by Metabot. */
    activeToolCalls: agent.activeToolCalls,

    /** Metabot's reactions state (navigation suggestions, code edits, etc). */
    reactions: agent.reactions,

    /**
     * Custom instructions appended to Metabot's system prompt.
     * Takes high precedence as it appears last in the prompt.
     *
     * @example
     * const { setCustomInstructions } = useMetabot();
     * setCustomInstructions("Always respond in bullet points.");
     */
    customInstructions,

    /** Set custom instructions for Metabot. Pass `undefined` to clear. */
    setCustomInstructions,
  };
};
