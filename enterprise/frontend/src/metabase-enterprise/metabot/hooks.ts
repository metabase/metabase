import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";
import { METABOT_TAG, useMetabotAgentMutation } from "metabase-enterprise/api";

import {
  dismissUserMessage,
  getIsProcessing,
  getMetabotVisisble,
  getUserMessages,
  sendMessage,
  setVisible,
} from "./state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();
  const { getChatContext } = useMetabotContext();

  // TODO: create an enterprise useSelector
  const userMessages = useSelector(getUserMessages as any) as ReturnType<
    typeof getUserMessages
  >;
  const isProcessing = useSelector(getIsProcessing as any) as ReturnType<
    typeof getIsProcessing
  >;

  const [, sendMessageReq] = useMetabotAgentMutation({
    fixedCacheKey: METABOT_TAG,
  });

  return {
    visible: useSelector(getMetabotVisisble as any),
    setVisible: (isVisible: boolean) => dispatch(setVisible(isVisible)),
    userMessages,
    dismissUserMessage: (messageIndex: number) =>
      dispatch(dismissUserMessage(messageIndex)),
    sendMessage: async (message: string) => {
      const context = getChatContext();
      const history = sendMessageReq.data?.history || [];
      await dispatch(sendMessage({ message, context, history }));
    },
    isLoading: sendMessageReq.isLoading,
    isProcessing,
  };
};
