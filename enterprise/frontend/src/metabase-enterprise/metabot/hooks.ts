import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";
import {
  METABOT_TAG,
  useGetSuggestedMetabotPromptsQuery,
  useMetabotAgentMutation,
} from "metabase-enterprise/api";

import {
  getIsProcessing,
  getMessages,
  getMetabotVisisble,
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

  const [, sendMessageReq] = useMetabotAgentMutation({
    fixedCacheKey: METABOT_TAG,
  });

  return {
    visible: useSelector(getMetabotVisisble as any) as ReturnType<
      typeof getMetabotVisisble
    >,
    setVisible: useCallback(
      (isVisible: boolean) => dispatch(setVisible(isVisible)),
      [dispatch],
    ),
    messages,
    isLongConversation: messages.length > 6, // TODO: figure out how we want to calculate this
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
