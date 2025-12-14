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
  resetConversation as resetConversationAction,
  retryPrompt,
  setVisible as setVisibleAction,
  submitInput as submitInputAction,
} from "../state";

export const useMetabotConversation = (convoId: MetabotConvoId) => {
  const dispatch = useDispatch();
  const { prompt, setPrompt, promptInputRef, getChatContext } =
    useMetabotContext();

  const metabotRequestId = useSelector((state: any) =>
    getMetabotRequestId(state, convoId),
  );
  const visible = useSelector((state: any) =>
    getMetabotVisible(state, convoId),
  );

  const setVisible = useCallback(
    (visible: boolean) =>
      dispatch(setVisibleAction({ convoId: convoId, visible })),
    [dispatch, convoId],
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
          convoId,
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
      convoId,
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
          convoId,
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
      convoId,
    ],
  );

  const cancelRequest = useCallback(() => {
    dispatch(cancelInflightAgentRequests(convoId));
  }, [dispatch, convoId]);

  const resetConversation = useCallback(() => {
    dispatch(resetConversationAction({ convoId }));
  }, [convoId, dispatch]);

  return {
    prompt,
    setPrompt,
    promptInputRef,
    visible,
    setVisible,
    resetConversation,
    submitInput,
    retryMessage,
    cancelRequest,
    metabotId: useSelector(getMetabotId),
    messages: useSelector((state: any) => getMessages(state, convoId)),
    errorMessages: useSelector((state: any) =>
      getAgentErrorMessages(state, convoId),
    ),
    isDoingScience: useSelector((state: any) =>
      getIsProcessing(state, convoId),
    ),
    isLongConversation: useSelector((state: any) =>
      getIsLongMetabotConversation(state, convoId),
    ),
    activeToolCalls: useSelector((state: any) =>
      getActiveToolCalls(state, convoId),
    ),
    debugMode: useSelector((state: any) => getDebugMode(state)),
    profileOverride: useSelector((state: any) =>
      getProfileOverride(state, convoId),
    ),
    reactions: useSelector((state: any) => getMetabotReactionsState(state)),
  };
};
