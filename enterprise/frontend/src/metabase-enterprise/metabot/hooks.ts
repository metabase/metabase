import { isFulfilled } from "@reduxjs/toolkit";
import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";

import {
  type MetabotPromptSubmissionResult,
  getAgentErrorMessages,
  getIsLongMetabotConversation,
  getIsProcessing,
  getLastAgentMessagesByType,
  getMessages,
  getMetabotId,
  getMetabotRequestId,
  getMetabotVisible,
  getToolCalls,
  resetConversation as resetConversationAction,
  retryPrompt,
  setVisible as setVisibleAction,
  submitInput as submitInputAction,
} from "./state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();
  const { prompt, setPrompt, promptInputRef, getChatContext } =
    useMetabotContext();

  // TODO: create an enterprise useSelector
  const messages = useSelector(getMessages as any) as ReturnType<
    typeof getMessages
  >;
  const errorMessages = useSelector(getAgentErrorMessages as any) as ReturnType<
    typeof getAgentErrorMessages
  >;
  const isProcessing = useSelector(getIsProcessing as any) as ReturnType<
    typeof getIsProcessing
  >;

  const visible = useSelector(getMetabotVisible as any) as ReturnType<
    typeof getMetabotVisible
  >;

  const metabotId = useSelector(getMetabotId as any) as ReturnType<
    typeof getMetabotId
  >;
  const metabotRequestId = useSelector(
    getMetabotRequestId as any,
  ) as ReturnType<typeof getMetabotRequestId>;

  const setVisible = useCallback(
    (isVisible: boolean) => dispatch(setVisibleAction(isVisible)),
    [dispatch],
  );

  const resetConversation = useCallback(
    () => dispatch(resetConversationAction()),
    [dispatch],
  );

  const prepareRetryIfUnsuccesful = useCallback(
    (result: MetabotPromptSubmissionResult) => {
      if (!result.success && result.shouldRetry) {
        promptInputRef?.current?.focus();
        setPrompt(result.prompt);
      }
    },
    [promptInputRef, setPrompt],
  );

  const submitInput = useCallback(
    async (prompt: string, metabotRequestId?: string) => {
      if (!visible) {
        setVisible(true);
      }

      const context = await getChatContext();
      const action = await dispatch(
        submitInputAction({
          message: prompt,
          context,
          metabot_id: metabotRequestId,
        }),
      );

      if (isFulfilled(action)) {
        prepareRetryIfUnsuccesful(action.payload);
      }

      return action;
    },
    [dispatch, getChatContext, prepareRetryIfUnsuccesful, setVisible, visible],
  );

  const retryMessage = useCallback(
    async (messageId: string, metabotRequestId?: string) => {
      const context = await getChatContext();
      const action = await dispatch(
        retryPrompt({
          messageId,
          context,
          metabot_id: metabotRequestId,
        }),
      );
      if (isFulfilled(action)) {
        prepareRetryIfUnsuccesful(action.payload);
      }
    },
    [dispatch, getChatContext, prepareRetryIfUnsuccesful],
  );

  const startNewConversation = useCallback(
    async (message: string, metabotId?: string) => {
      await resetConversation();
      setVisible(true);
      if (message) {
        submitInput(message, metabotId);
      }
      promptInputRef?.current?.focus();
    },
    [submitInput, resetConversation, setVisible, promptInputRef],
  );

  return {
    prompt,
    setPrompt,
    promptInputRef,
    metabotId,
    metabotRequestId,
    visible,
    messages,
    errorMessages,
    lastAgentMessages: useSelector(
      getLastAgentMessagesByType as any,
    ) as ReturnType<typeof getLastAgentMessagesByType>,
    isLongConversation: useSelector(
      getIsLongMetabotConversation as any,
    ) as ReturnType<typeof getIsLongMetabotConversation>,
    resetConversation,
    setVisible,
    startNewConversation,
    submitInput,
    isDoingScience: isProcessing,
    toolCalls: useSelector(getToolCalls as any) as ReturnType<
      typeof getToolCalls
    >,
    retryMessage,
  };
};
