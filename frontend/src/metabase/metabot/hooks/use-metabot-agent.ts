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
  focusPromptInput as focusPromptInputAction,
  forkConversation as forkConversationAction,
  getActiveToolCalls,
  getConversationTitle,
  getDebugMode,
  getIsLongMetabotConversation,
  getIsProcessing,
  getMessages,
  getMetabotId,
  getMetabotReactionsState,
  getMetabotRequestId,
  getMetabotRequestState,
  getMetabotVisible,
  getModelOverride,
  getPrompt,
  getSelectedDatabaseId,
  resetConversation as resetConversationAction,
  retryPrompt,
  setModelOverride as setModelOverrideAction,
  setProfileOverride as setProfileOverrideAction,
  setPrompt as setPromptAction,
  setSelectedDatabaseId as setSelectedDatabaseIdAction,
  setVisible as setVisibleAction,
  submitInput as submitInputAction,
} from "../state";

export const useMetabotAgent = (agentId: MetabotAgentId = "omnibot") => {
  const dispatch = useDispatch();
  const { getChatContext } = useMetabotContext();

  const prompt = useSelector((state) => getPrompt(state, agentId));
  const setPrompt = useCallback(
    (prompt: string) => dispatch(setPromptAction({ agentId, prompt })),
    [dispatch, agentId],
  );
  const focusPromptInput = useCallback(
    () => dispatch(focusPromptInputAction({ agentId })),
    [dispatch, agentId],
  );

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
        setPrompt(result.prompt);
        focusPromptInput();
      }
    },
    [focusPromptInput, setPrompt],
  );

  const setProfileOverride = useCallback(
    (profile: MetabotProfileId | undefined) => {
      dispatch(setProfileOverrideAction({ agentId, profile }));
    },
    [dispatch, agentId],
  );

  const setModelOverride = useCallback(
    (model: string | undefined) => {
      dispatch(setModelOverrideAction({ agentId, model }));
    },
    [dispatch, agentId],
  );

  const setSelectedDatabaseId = useCallback(
    (databaseId: number | undefined) => {
      dispatch(setSelectedDatabaseIdAction({ agentId, databaseId }));
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
        suppressNavigateTo?: boolean;
        hidden?: boolean;
      },
    ) => {
      if (!options?.hidden) {
        setPrompt("");
      }

      if (!options?.hidden && !visible && !options?.preventOpenSidebar) {
        setVisible(true);
      }

      if (options?.focusInput) {
        focusPromptInput();
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
          suppressNavigateTo: options?.suppressNavigateTo,
          hidden: options?.hidden,
        }),
      );

      if (!options?.hidden) {
        trackMetabotRequestSent();
      }

      if (!options?.hidden && isFulfilled(action)) {
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
      focusPromptInput,
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

  const forkMessage = useCallback(
    (messageId: string) =>
      dispatch(forkConversationAction({ agentId, messageId })),
    [dispatch, agentId],
  );

  const cancelRequest = useCallback(() => {
    dispatch(cancelInflightAgentRequests(agentId));
  }, [dispatch, agentId]);

  const resetConversation = useCallback(() => {
    dispatch(resetConversationAction({ agentId }));
  }, [agentId, dispatch]);

  return {
    prompt,
    title: useSelector((state) => getConversationTitle(state, agentId)),
    setPrompt,
    focusPromptInput,
    visible,
    setVisible,
    modelOverride: useSelector((state) => getModelOverride(state, agentId)),
    setModelOverride,
    setProfileOverride,
    selectedDatabaseId: useSelector((state) =>
      getSelectedDatabaseId(state, agentId),
    ),
    setSelectedDatabaseId,
    resetConversation,
    submitInput,
    retryMessage,
    forkMessage,
    cancelRequest,
    metabotId: useSelector(getMetabotId),
    requestState: useSelector((state) =>
      getMetabotRequestState(state, agentId),
    ),
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
