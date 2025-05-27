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
  getLastHistoryValue,
  getMetabotState,
  getLastAgentMessagesByType,
  getMessages,
  getMetabotVisible,
  resetConversation,
  setVisible,
  submitInput,
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

  const metabotState = useSelector(getMetabotState as any) as ReturnType<
    typeof getMetabotState
  >;

  const lastHistoryValue = useSelector(
    getLastHistoryValue as any,
  ) as ReturnType<typeof getLastHistoryValue>;

  const [, sendMessageReq] = useMetabotAgentMutation({
    fixedCacheKey: METABOT_TAG,
  });

  console.log("METABOT FROM SELECTORS", metabotState, lastHistoryValue);
  console.log(
    "METABOT FROM CACHE",
    sendMessageReq.data?.state,
    sendMessageReq.data?.history,
  );

  return {
    visible: useSelector(getMetabotVisible as any) as ReturnType<
      typeof getMetabotVisible
    >,
    setVisible: useCallback(
      (isVisible: boolean) => dispatch(setVisible(isVisible)),
      [dispatch],
    ),
    messages,
    lastAgentMessages: useSelector(
      getLastAgentMessagesByType as any,
    ) as ReturnType<typeof getLastAgentMessagesByType>,
    isLongConversation: useSelector(
      getIsLongMetabotConversation as any,
    ) as ReturnType<typeof getIsLongMetabotConversation>,
    resetConversation: () => dispatch(resetConversation()),
    submitInput: useCallback(
      (message: string, metabotId?: string) => {
        const context = getChatContext();
        const history = sendMessageReq.data?.history || [];
        const state = sendMessageReq.data?.state || {};
        return dispatch(
          submitInput({
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
    ),
    isDoingScience: sendMessageReq.isLoading || isProcessing,
    suggestedPrompts: suggestedPromptsReq,
  };
};
