import { useCallback } from "react";

import { useSelector } from "metabase/lib/redux";
import { getIsProcessing } from "metabase-enterprise/metabot/state";

import { useMetabotAgent } from "./use-metabot-agent";

export const useMetabotChat = () => {
  const { setPrompt, promptInputRef, submitInput, retryMessage } =
    useMetabotAgent();

  const isDoingScience = useSelector(getIsProcessing as any) as ReturnType<
    typeof getIsProcessing
  >;

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
    isDoingScience,
    handleSubmitInput,
    handleRetryMessage,
    handleResetInput,
  };
};
