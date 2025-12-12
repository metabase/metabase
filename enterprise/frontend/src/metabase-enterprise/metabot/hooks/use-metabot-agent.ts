import { isFulfilled } from "@reduxjs/toolkit";
import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";

import { trackMetabotRequestSent } from "../analytics";
import {
  type MetabotConvoId,
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
  getProfileOverride,
  getUniqueConversationId,
  resetConversation as resetConversationAction,
  retryPrompt,
  setProfileOverride as setProfileOverrideAction,
  setVisible as setVisibleAction,
  submitInput as submitInputAction,
} from "../state";

export const useMetabotAgent = (convoId: MetabotConvoId = "omnibot") => {
  const dispatch = useDispatch();
  const { prompt, setPrompt, promptInputRef, getChatContext } =
    useMetabotContext();

  const conversation_id = useSelector((state) =>
    getUniqueConversationId(state as any, convoId),
  );
  const metabotRequestId = useSelector((state: any) =>
    getMetabotRequestId(state, conversation_id),
  );
  const visible = useSelector((state: any) =>
    getMetabotVisible(state, conversation_id),
  );

  const setVisible = useCallback(
    (visible: boolean) =>
      dispatch(setVisibleAction({ conversation_id, visible })),
    [dispatch, conversation_id],
  );

  const setProfileOverride = useCallback(
    (profile: string | undefined) => {
      dispatch(setProfileOverrideAction({ conversation_id, profile }));
    },
    [dispatch, conversation_id],
  );

  const resetConversation = useCallback(
    () => dispatch(resetConversationAction(conversation_id)),
    [dispatch, conversation_id],
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
    async (
      prompt: string | Omit<MetabotUserChatMessage, "id" | "role">,
      options?: {
        profile?: string | undefined;
        preventOpenSidebar?: boolean;
      },
    ) => {
      setProfileOverride(options?.profile);

      if (!visible && !options?.preventOpenSidebar) {
        setVisible(true);
      }

      const context = await getChatContext();
      const action = await dispatch(
        submitInputAction({
          ...(typeof prompt === "string"
            ? { type: "text", message: prompt }
            : prompt),
          context,
          conversation_id,
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
      setProfileOverride,
      setVisible,
      visible,
      conversation_id,
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
          conversation_id,
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
      conversation_id,
    ],
  );

  const cancelRequest = useCallback(() => {
    dispatch(cancelInflightAgentRequests(conversation_id));
  }, [dispatch, conversation_id]);

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
    prompt,
    setPrompt,
    promptInputRef,
    visible,
    resetConversation,
    setVisible,
    startNewConversation,
    submitInput,
    retryMessage,
    cancelRequest,
    setProfileOverride,
    metabotId: useSelector((state: any) => getMetabotId(state)),
    messages: useSelector((state: any) => getMessages(state, conversation_id)),
    errorMessages: useSelector((state: any) =>
      getAgentErrorMessages(state, conversation_id),
    ),
    isDoingScience: useSelector((state: any) =>
      getIsProcessing(state, conversation_id),
    ),
    isLongConversation: useSelector((state: any) =>
      getIsLongMetabotConversation(state, conversation_id),
    ),
    activeToolCalls: useSelector((state: any) =>
      getActiveToolCalls(state, conversation_id),
    ),
    debugMode: useSelector((state: any) => getDebugMode(state)),
    profileOverride: useSelector((state: any) =>
      getProfileOverride(state, conversation_id),
    ),
    reactions: useSelector((state: any) => getMetabotReactionsState(state)),
  };
};
