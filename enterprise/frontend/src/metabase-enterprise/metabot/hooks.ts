import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";
import {
  METABOT_TAG,
  useGetSuggestedMetabotPromptsQuery,
  useMetabotAgentMutation,
} from "metabase-enterprise/api";

import {
  getIsLongMetabotConversation,
  getIsProcessing,
  getLastAgentMessagesByType,
  getMessages,
  getMetabotVisible,
  resetConversation as resetConversationAction,
  setVisible as setVisibleAction,
  submitInput as submitInputAction,
} from "./state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();
  const { getChatContext } = useMetabotContext();

  const suggestedPromptsReq = useGetSuggestedMetabotPromptsQuery();

  // TODO: create an enterprise useSelector
  const messages = useSelector(getMessages as any) as ReturnType<
    typeof getMessages
  >;
  const isProcessing = useSelector(getIsProcessing as any) as ReturnType<
    typeof getIsProcessing
  >;

  const [, sendMessageReq] = useMetabotAgentMutation({
    fixedCacheKey: METABOT_TAG,
  });

  const setVisible = useCallback(
    (isVisible: boolean) => dispatch(setVisibleAction(isVisible)),
    [dispatch],
  );

  const resetConversation = useCallback(
    () => dispatch(resetConversationAction()),
    [dispatch],
  );

  const submitInput = useCallback(
    (message: string, metabotId?: string) => {
      const context = getChatContext();
      const history = sendMessageReq.data?.history || [];
      const state = sendMessageReq.data?.state || {};
      return dispatch(
        submitInputAction({
          message,
          context,
          history,
          state,
          metabot_id: metabotId,
        }),
      );
    },
    [
      dispatch,
      getChatContext,
      sendMessageReq.data?.history,
      sendMessageReq.data?.state,
    ],
  );

  const startNewConversation = useCallback(
    (message: string, metabotId?: string) => {
      // TODO: resetting the convo does not work because submitInput has history + state
      // references from sendMessageReq which doesn't change in the durration of this cb.
      // history + state should be selected another way to prevent this...
      resetConversation();
      setVisible(true);
      if (message) {
        submitInput(message, metabotId);
      }

      // HACK: if the user opens the command palette via the search button bar focus will be moved
      // back to the search button bar if the metabot option is chosen, so a small delay is used
      setTimeout(() => {
        document.getElementById("metabot-chat-input")?.focus();
      }, 100);
    },
    [submitInput, resetConversation, setVisible],
  );

  return {
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
    submitInput,
    startNewConversation,
    isDoingScience: sendMessageReq.isLoading || isProcessing,
    suggestedPrompts: suggestedPromptsReq,
  };
};
