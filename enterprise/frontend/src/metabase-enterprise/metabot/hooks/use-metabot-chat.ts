import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  getMetabotReactionsState,
  setNavigateToPath as setNavigateToPathAction,
} from "metabase-enterprise/metabot/state";

import { useMetabotAgent } from "./use-metabot-agent";

export const useMetabotChat = () => {
  const dispatch = useDispatch();

  const {
    isDoingScience,
    setPrompt,
    promptInputRef,
    submitInput,
    retryMessage,
  } = useMetabotAgent();

  const { navigateToPath } = useSelector(
    getMetabotReactionsState as any,
  ) as ReturnType<typeof getMetabotReactionsState>;

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

  const setNavigateToPath = useCallback(
    async (navigateToPath: string) => {
      dispatch(setNavigateToPathAction(navigateToPath));
    },
    [dispatch],
  );

  return {
    handleSubmitInput,
    handleRetryMessage,
    handleResetInput,
    navigateToPath,
    setNavigateToPath,
  };
};
