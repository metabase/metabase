import { isFulfilled } from "@reduxjs/toolkit";
import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";

import { trackMetabotRequestSent } from "../analytics";
import {
  type MetabotPromptSubmissionResult,
  type MetabotUserChatMessage,
  getAgentErrorMessages,
  getIsLongMetabotConversation,
  getIsProcessing,
  getMessages,
  getMetabotId,
  getMetabotReactionsState,
  getMetabotRequestId,
  getMetabotVisible,
  getProfileOverride,
  getToolCalls,
  resetConversation as resetConversationAction,
  retryPrompt,
  setVisible as setVisibleAction,
  submitInput as submitInputAction,
} from "../state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();
  const { prompt, setPrompt, promptInputRef, getChatContext } =
    useMetabotContext();

  const isDoingScience = useSelector(getIsProcessing as any) as ReturnType<
    typeof getIsProcessing
  >;

  // TODO: create an enterprise useSelector
  const messages = useSelector(getMessages as any) as ReturnType<
    typeof getMessages
  >;

  const errorMessages = useSelector(getAgentErrorMessages as any) as ReturnType<
    typeof getAgentErrorMessages
  >;

  const isLongConversation = useSelector(
    getIsLongMetabotConversation as any,
  ) as ReturnType<typeof getIsLongMetabotConversation>;

  const visible = useSelector(getMetabotVisible as any) as ReturnType<
    typeof getMetabotVisible
  >;

  const metabotId = useSelector(getMetabotId as any) as ReturnType<
    typeof getMetabotId
  >;
  const metabotRequestId = useSelector(
    getMetabotRequestId as any,
  ) as ReturnType<typeof getMetabotRequestId>;

  const toolCalls = useSelector(getToolCalls as any) as ReturnType<
    typeof getToolCalls
  >;

  const setVisible = useCallback(
    (isVisible: boolean) => dispatch(setVisibleAction(isVisible)),
    [dispatch],
  );

  const profileOverride = useSelector(getProfileOverride as any) as ReturnType<
    typeof getProfileOverride
  >;

  const reactions = useSelector(getMetabotReactionsState as any) as ReturnType<
    typeof getMetabotReactionsState
  >;

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
    async (prompt: string | Omit<MetabotUserChatMessage, "id" | "role">) => {
      if (!visible) {
        setVisible(true);
      }

      const context = await getChatContext();
      const action = await dispatch(
        submitInputAction(
          typeof prompt === "string"
            ? {
                type: "text",
                message: prompt,
                context,
                metabot_id: metabotRequestId,
              }
            : {
                ...prompt,
                context,
                metabot_id: metabotRequestId,
              },
        ),
      );

      trackMetabotRequestSent();

      if (isFulfilled(action)) {
        prepareRetryIfUnsuccesful(action.payload);
      }

      return action;
    },
    [
      dispatch,
      getChatContext,
      metabotRequestId,
      prepareRetryIfUnsuccesful,
      setVisible,
      visible,
    ],
  );

  const retryMessage = useCallback(
    async (messageId: string) => {
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
    [dispatch, getChatContext, metabotRequestId, prepareRetryIfUnsuccesful],
  );

  const startNewConversation = useCallback(
    async (message: string) => {
      await resetConversation();
      setVisible(true);
      if (message) {
        submitInput(message);
      }
      promptInputRef?.current?.focus();
    },
    [resetConversation, setVisible, promptInputRef, submitInput],
  );

  return {
    isDoingScience,
    prompt,
    setPrompt,
    promptInputRef,
    metabotId,
    visible,
    messages,
    errorMessages,
    isLongConversation,
    resetConversation,
    setVisible,
    startNewConversation,
    submitInput,
    retryMessage,
    toolCalls,
    profileOverride,
    reactions,
  };
};
