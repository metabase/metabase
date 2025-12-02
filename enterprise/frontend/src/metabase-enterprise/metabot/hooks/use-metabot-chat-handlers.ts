import { useCallback, useMemo } from "react";

import type { MetabotConfig } from "../components/Metabot";

import { useMetabotAgent } from "./use-metabot-agent";

export const useMetabotChatHandlers = (
  config?: Partial<Pick<MetabotConfig, "preventRetryMessage">>,
) => {
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

  const handleRetryMessage = useMemo(() => {
    if (config?.preventRetryMessage) {
      return undefined;
    }

    return (messageId: string) => {
      if (isDoingScience) {
        return;
      }

      setPrompt("");
      promptInputRef?.current?.focus();
      retryMessage(messageId).catch((err) => console.error(err));
    };
  }, [
    config?.preventRetryMessage,
    isDoingScience,
    promptInputRef,
    retryMessage,
    setPrompt,
  ]);

  const handleResetInput = useCallback(() => {
    setPrompt("");
  }, [setPrompt]);

  return {
    handleSubmitInput,
    handleRetryMessage,
    handleResetInput,
  };
};
