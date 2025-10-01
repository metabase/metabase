import { useCallback } from "react";

import { useMetabotAgent } from "./use-metabot-agent";

export const useMetabotChatHandlers = () => {
  const {
    isDoingScience,
    setPrompt,
    promptInputRef,
    submitInput,
    retryMessage,
  } = useMetabotAgent();

  const handleSubmitInput = useCallback(
    (input: string) => {
      if (isDoingScience) {
        return;
      }

      const trimmedInput = input.trim();
      if (!trimmedInput.length || isDoingScience) {
        return;
      }
      setPrompt("");
      promptInputRef?.current?.focus();
      submitInput(trimmedInput).catch((err) => console.error(err));
    },
    [isDoingScience, promptInputRef, setPrompt, submitInput],
  );

  const handleRetryMessage = useCallback(
    (messageId: string) => {
      if (isDoingScience) {
        return;
      }

      setPrompt("");
      promptInputRef?.current?.focus();
      retryMessage(messageId).catch((err) => console.error(err));
    },
    [isDoingScience, promptInputRef, retryMessage, setPrompt],
  );

  const handleResetInput = useCallback(() => {
    setPrompt("");
  }, [setPrompt]);

  return {
    handleSubmitInput,
    handleRetryMessage,
    handleResetInput,
  };
};
