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
  newConversation,
  resetConversation,
  retryPrompt,
  setProfileOverride as setProfileOverrideAction,
  setVisible as setVisibleAction,
  submitInput as submitInputAction,
} from "../state";

export const useMetabotConversation = (convoId: MetabotConvoId = "omnibot") => {
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

  const setProfileOverride = useCallback(
    (profile: string | undefined) => {
      dispatch(setProfileOverrideAction({ convoId: convoId, profile }));
    },
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
      setProfileOverride(options?.profile);

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
      setProfileOverride,
      setVisible,
      visible,
      convoId,
      promptInputRef,
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

  const startNewConversation = useCallback(() => {
    // TODO fix these methods
    dispatch(resetConversation({ convoId, resetReactions: true }));
    dispatch(newConversation({ convoId, visible: true }));
  }, [convoId, dispatch]);

  return {
    prompt,
    setPrompt,
    promptInputRef,
    visible,
    setVisible,
    startNewConversation,
    submitInput,
    retryMessage,
    cancelRequest,
    setProfileOverride,
    metabotId: useSelector((state: any) => getMetabotId(state)),
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
