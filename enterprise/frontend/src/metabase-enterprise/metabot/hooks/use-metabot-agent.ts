import { isFulfilled } from "@reduxjs/toolkit";
import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";

import { trackMetabotRequestSent } from "../analytics";
import {
  type MetabotPromptSubmissionResult,
  type MetabotUserChatMessage,
  addDeveloperMessage as addDeveloperMessageAction,
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
  setProfileOverride as setProfileOverrideAction,
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

  const activeToolCalls = useSelector(getActiveToolCalls as any) as ReturnType<
    typeof getActiveToolCalls
  >;

  const debugMode = useSelector(getDebugMode as any) as ReturnType<
    typeof getDebugMode
  >;

  const setVisible = useCallback(
    (isVisible: boolean) => dispatch(setVisibleAction(isVisible)),
    [dispatch],
  );

  const profileOverride = useSelector(getProfileOverride as any) as ReturnType<
    typeof getProfileOverride
  >;

  const setProfileOverride = useCallback(
    (profile: string | undefined) => {
      dispatch(setProfileOverrideAction(profile));
    },
    [dispatch],
  );

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
      setProfileOverride,
      setVisible,
      visible,
    ],
  );

  const addDeveloperMessage = useCallback(
    (message: string) => {
      dispatch(addDeveloperMessageAction({ message }));
    },
    [dispatch],
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

  const cancelRequest = useCallback(() => {
    dispatch(cancelInflightAgentRequests());
  }, [dispatch]);

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
    cancelRequest,
    activeToolCalls,
    debugMode,
    profileOverride,
    setProfileOverride,
    reactions,
    addDeveloperMessage,
  };
};
