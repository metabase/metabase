import { isFulfilled } from "@reduxjs/toolkit";
import { useCallback } from "react";

import { useMetabotContext } from "metabase/metabot";

import { trackMetabotRequestSent } from "../analytics";
import {
  type MetabotAgentId,
  type MetabotPromptSubmissionResult,
  type MetabotUserChatMessage,
  cancelInflightAgentRequests,
  getActiveToolCalls,
  getAgentErrorMessages,
  getDebugMode,
  getIsLongMetabotConversation,
  getIsProcessing,
  getMessages,
  getMetabotId,
  getMetabotReactionsState,
  getMetabotRequestId,
  getMetabotVisible,
  resetConversation as resetConversationAction,
  retryPrompt,
  setProfileOverride as setProfileOverrideAction,
  setVisible as setVisibleAction,
  submitInput as submitInputAction,
} from "../state";

import { useMetabotDispatch, useMetabotSelector } from "./use-metabot-store";

export const useMetabotAgent = (agentId: MetabotAgentId = "omnibot") => {
  const dispatch = useMetabotDispatch();
  const { prompt, setPrompt, promptInputRef, getChatContext } =
    useMetabotContext();

  const metabotRequestId = useMetabotSelector((state) =>
    getMetabotRequestId(state, agentId),
  );
  const visible = useMetabotSelector((state) =>
    getMetabotVisible(state, agentId),
  );

  const setVisible = useCallback(
    (visible: boolean) => dispatch(setVisibleAction({ agentId, visible })),
    [dispatch, agentId],
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

  const setProfileOverride = useCallback(
    (profile: string) => {
      dispatch(setProfileOverrideAction({ agentId, profile }));
    },
    [dispatch, agentId],
  );

  const submitInput = useCallback(
    async (
      prompt: string | Omit<MetabotUserChatMessage, "id" | "role">,
      options?: {
        profile?: string | undefined;
        preventOpenSidebar?: boolean;
        focusInput?: boolean;
      },
    ) => {
      setPrompt("");

      if (!visible && !options?.preventOpenSidebar) {
        setVisible(true);
      }

      if (options?.focusInput) {
        promptInputRef?.current?.focus();
      }

      const action = await dispatch(
        submitInputAction({
          ...(typeof prompt === "string"
            ? { type: "text", message: prompt }
            : prompt),
          context: await getChatContext(),
          agentId,
          metabot_id: metabotRequestId,
        }),
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
      agentId,
      promptInputRef,
      setPrompt,
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
          agentId,
        }),
      );
      if (isFulfilled(action)) {
        prepareRetryIfUnsuccesful(action.payload);
      }
    },
    [
      dispatch,
      getChatContext,
      metabotRequestId,
      prepareRetryIfUnsuccesful,
      agentId,
    ],
  );

  const cancelRequest = useCallback(() => {
    dispatch(cancelInflightAgentRequests(agentId));
  }, [dispatch, agentId]);

  const resetConversation = useCallback(() => {
    dispatch(resetConversationAction({ agentId }));
  }, [agentId, dispatch]);

  return {
    prompt,
    setPrompt,
    promptInputRef,
    visible,
    setVisible,
    setProfileOverride,
    resetConversation,
    submitInput,
    retryMessage,
    cancelRequest,
    metabotId: useMetabotSelector(getMetabotId),
    messages: useMetabotSelector((state) => getMessages(state, agentId)),
    errorMessages: useMetabotSelector((state) =>
      getAgentErrorMessages(state, agentId),
    ),
    isDoingScience: useMetabotSelector((state) =>
      getIsProcessing(state, agentId),
    ),
    isLongConversation: useMetabotSelector((state) =>
      getIsLongMetabotConversation(state, agentId),
    ),
    activeToolCalls: useMetabotSelector((state) =>
      getActiveToolCalls(state, agentId),
    ),
    debugMode: useMetabotSelector(getDebugMode),
    reactions: useMetabotSelector(getMetabotReactionsState),
  };
};
