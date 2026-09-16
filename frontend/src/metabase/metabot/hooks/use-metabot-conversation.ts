import { isFulfilled } from "@reduxjs/toolkit";
import { useCallback } from "react";

import { useMetabotContext } from "metabase/metabot";
import { useDispatch, useSelector } from "metabase/redux";

import { trackMetabotRequestSent } from "../analytics";
import type { MetabotProfileId } from "../constants";
import {
  type MetabotPromptSubmissionResult,
  type MetabotUserChatMessage,
  cancelInflightConversationRequests,
  fetchConversationSnapshot,
  getActiveToolCalls,
  getContextUsagePercent,
  getConversationForkedFrom,
  getConversationTitle,
  getDebugMode,
  getIsConversationProcessing,
  getLongChatNotice,
  getMessages,
  getMetabotId,
  getMetabotReactionsState,
  getMetabotRequestId,
  getProfileOverride,
  retryPrompt,
  setProfileOverride as setProfileOverrideAction,
  submitInput as submitInputAction,
} from "../state";

import { useIsFullPageMetabot } from "./use-is-full-page-metabot";

export type SubmitInputOptions = {
  profile?: MetabotProfileId | undefined;
  focusInput?: boolean;
  onBeforeSubmit?: () => void;
};

/**
 * Drive a conversation by id rather than through a surface. Two surfaces showing the same
 * conversation observe one record, so neither can fall behind the other.
 */
export const useMetabotConversation = (conversationId: string) => {
  const dispatch = useDispatch();
  const { prompt, setPrompt, promptInputRef, getChatContext } =
    useMetabotContext();

  const isFullPageMetabot = useIsFullPageMetabot();

  const metabotRequestId = useSelector((state) =>
    getMetabotRequestId(state, conversationId),
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
      dispatch(setProfileOverrideAction({ conversationId, profile }));
    },
    [dispatch, conversationId],
  );

  const submitInput = useCallback(
    async (
      prompt: string | Omit<MetabotUserChatMessage, "id" | "role">,
      options?: SubmitInputOptions,
    ) => {
      setPrompt("");
      options?.onBeforeSubmit?.();

      if (options?.focusInput) {
        promptInputRef?.current?.focus();
      }

      const action = await dispatch(
        submitInputAction({
          ...(typeof prompt === "string"
            ? { type: "text", message: prompt }
            : prompt),
          context: await getChatContext(),
          conversationId,
          metabot_id: metabotRequestId,
          profile: options?.profile,
          isFullPageMetabot,
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
      conversationId,
      promptInputRef,
      setPrompt,
      isFullPageMetabot,
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
          conversationId,
          profile: options?.profile,
          isFullPageMetabot,
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
      conversationId,
      isFullPageMetabot,
    ],
  );

  const cancelRequest = useCallback(() => {
    dispatch(cancelInflightConversationRequests(conversationId));
  }, [dispatch, conversationId]);

  const reloadConversation = useCallback(() => {
    dispatch(fetchConversationSnapshot(conversationId));
  }, [dispatch, conversationId]);

  const longChatNotice = useSelector((state) =>
    getLongChatNotice(state, conversationId),
  );

  return {
    conversationId,
    prompt,
    setPrompt,
    promptInputRef,
    setProfileOverride,
    submitInput,
    retryMessage,
    cancelRequest,
    reloadConversation,
    metabotId: useSelector(getMetabotId),
    profile: useSelector((state) => getProfileOverride(state, conversationId)),
    title: useSelector((state) => getConversationTitle(state, conversationId)),
    forkedFromConversationId: useSelector((state) =>
      getConversationForkedFrom(state, conversationId),
    ),
    messages: useSelector((state) => getMessages(state, conversationId)),
    isDoingScience: useSelector((state) =>
      getIsConversationProcessing(state, conversationId),
    ),
    longChatNotice,
    isContextWindowFull: longChatNotice === "full",
    contextWindowPercentUsage: useSelector((state) =>
      getContextUsagePercent(state, conversationId),
    ),
    activeToolCalls: useSelector((state) =>
      getActiveToolCalls(state, conversationId),
    ),
    debugMode: useSelector(getDebugMode),
    reactions: useSelector(getMetabotReactionsState),
  };
};
