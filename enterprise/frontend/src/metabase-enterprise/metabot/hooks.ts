import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";

import {
  getActiveToolCall,
  getIsLongMetabotConversation,
  getIsProcessing,
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
        return dispatch(
          submitInput({
            message,
            context,
            metabot_id: metabotId,
          }),
        );
      },
      [dispatch, getChatContext],
    ),
    isDoingScience: isProcessing,
    suggestedPrompts: suggestedPromptsReq,
    activeToolCall: useSelector(getActiveToolCall as any) as ReturnType<
      typeof getActiveToolCall
    >,
  };
};
