import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";
import { METABOT_TAG, useMetabotAgentMutation } from "metabase-enterprise/api";

import {
  getIsLongMetabotConversation,
  getIsProcessing,
  getLastAgentMessagesByType,
  getMessages,
  getMetabotId,
  getMetabotVisible,
  resetConversation as resetConversationAction,
  setVisible as setVisibleAction,
  submitInput as submitInputAction,
} from "./state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();
  const { getChatContext } = useMetabotContext();

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
    async (message: string, metabotId?: string) => {
      const context = await getChatContext();

      return dispatch(
        submitInputAction({
          message,
          context,
          metabot_id: metabotId,
        }),
      );
    },
    [dispatch, getChatContext],
  );

  const startNewConversation = useCallback(
    (message: string, metabotId?: string) => {
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
    metabotId: useSelector(getMetabotId as any) as ReturnType<
      typeof getMetabotId
    >,
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
    startNewConversation,
    submitInput,
    isDoingScience: sendMessageReq.isLoading || isProcessing,
  };
};
