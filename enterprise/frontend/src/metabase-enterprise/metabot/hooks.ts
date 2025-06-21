import { isFulfilled } from "@reduxjs/toolkit";
import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";

import {
  type MetabotPromptSubmissionResult,
  getActiveToolCall,
  getIsLongMetabotConversation,
  getIsProcessing,
  getLastAgentMessagesByType,
  getMessages,
  getMetabotId,
  getMetabotVisible,
  getUseStreaming,
  resetConversation as resetConversationAction,
  retryPrompt,
  setVisible as setVisibleAction,
  submitInput as submitInputAction,
  toggleStreaming,
} from "./state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();
  const { prompt, setPrompt, promptInputRef, getChatContext } =
    useMetabotContext();

  // TODO: create an enterprise useSelector
  const messages = useSelector(getMessages as any) as ReturnType<
    typeof getMessages
  >;
  const isProcessing = useSelector(getIsProcessing as any) as ReturnType<
    typeof getIsProcessing
  >;

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
    async (prompt: string, metabotId?: string) => {
      const context = await getChatContext();
      const action = await dispatch(
        submitInputAction({
          message: prompt,
          context,
          metabot_id: metabotId,
        }),
      );

      if (isFulfilled(action)) {
        prepareRetryIfUnsuccesful(action.payload);
      }

      return action;
    },
    [dispatch, getChatContext, prepareRetryIfUnsuccesful],
  );

  const retryMessage = useCallback(
    async (messageId: string, metabotId?: string) => {
      const context = await getChatContext();
      const action = await dispatch(
        retryPrompt({
          messageId,
          context,
          metabot_id: metabotId,
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
    metabotId: useSelector(getMetabotId as any) as ReturnType<
      typeof getMetabotId
    >,
    visible: useSelector(getMetabotVisible as any) as ReturnType<
      typeof getMetabotVisible
    >,
    messages,
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
    activeToolCall: useSelector(getActiveToolCall as any) as ReturnType<
      typeof getActiveToolCall
    >,
    useStreaming: useSelector(getUseStreaming as any) as ReturnType<
      typeof getUseStreaming
    >,
    toggleStreaming: () => dispatch(toggleStreaming()),
    retryMessage,
  };
};
