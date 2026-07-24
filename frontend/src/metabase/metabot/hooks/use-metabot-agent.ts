import { isFulfilled } from "@reduxjs/toolkit";
import { useCallback } from "react";

import { useMetabotContext } from "metabase/metabot";
import { useDispatch, useSelector } from "metabase/redux";

import { trackMetabotRequestSent } from "../analytics";
import type { MetabotProfileId } from "../constants";
import {
  type MetabotAgentId,
  type MetabotPromptSubmissionResult,
  type MetabotUserChatMessage,
  cancelInflightAgentRequests,
  getActiveToolCalls,
  getDebugMode,
  getIsLongMetabotConversation,
  getIsProcessing,
  getMessages,
  getMetabotConversationId,
  getMetabotConversationTitle,
  getMetabotId,
  getMetabotReactionsState,
  getMetabotRequestId,
  getMetabotVisible,
  getProfile,
  loadConversation as loadConversationAction,
  resetConversation as resetConversationAction,
  retryPrompt,
  setProfileOverride as setProfileOverrideAction,
  setVisible as setVisibleAction,
  submitInput as submitInputAction,
} from "../state";

export const useMetabotAgent = (agentId: MetabotAgentId = "omnibot") => {
  const dispatch = useDispatch();
  const { prompt, setPrompt, promptInputRef, getChatContext } =
    useMetabotContext();

  const metabotRequestId = useSelector((state) =>
    getMetabotRequestId(state, agentId),
  );
  const visible = useSelector((state) => getMetabotVisible(state, agentId));

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
    (profile: MetabotProfileId | undefined) => {
      dispatch(setProfileOverrideAction({ agentId, profile }));
    },
    [dispatch, agentId],
  );

  const submitInput = useCallback(
    async (
      prompt: string | Omit<MetabotUserChatMessage, "id" | "role">,
      options?: {
        profile?: MetabotProfileId | undefined;
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
          profile: options?.profile,
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
    async (messageId: string, options?: { profile?: MetabotProfileId }) => {
      const context = await getChatContext();
      const action = await dispatch(
        retryPrompt({
          messageId,
          context,
          metabot_id: metabotRequestId,
          agentId,
          profile: options?.profile,
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

  const createNewConversation = useCallback(() => {
    dispatch(resetConversationAction({ agentId }));
  }, [agentId, dispatch]);

  const loadConversation = useCallback(
    (conversationId: string) =>
      dispatch(loadConversationAction({ agentId, conversationId })),
    [agentId, dispatch],
  );

  return {
    prompt,
    setPrompt,
    promptInputRef,
    visible,
    setVisible,
    setProfileOverride,
    createNewConversation,
    loadConversation,
    submitInput,
    retryMessage,
    cancelRequest,
    metabotId: useSelector(getMetabotId),
    profile: useSelector((state) => getProfile(state, agentId)),
    conversationId: useSelector((state) =>
      getMetabotConversationId(state, agentId),
    ),
    title: useSelector((state) => getMetabotConversationTitle(state, agentId)),
    messages: useSelector((state) => getMessages(state, agentId)),
    isDoingScience: useSelector((state) => getIsProcessing(state, agentId)),
    isLongConversation: useSelector((state) =>
      getIsLongMetabotConversation(state, agentId),
    ),
    activeToolCalls: useSelector((state) => getActiveToolCalls(state, agentId)),
    debugMode: useSelector(getDebugMode),
    reactions: useSelector(getMetabotReactionsState),
  };
};
