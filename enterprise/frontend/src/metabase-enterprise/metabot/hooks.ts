import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";
import { useMetabotAgentMutation } from "metabase-enterprise/api";

import {
  clearUserMessages,
  getMetabotVisisble,
  getUserMessages,
  processMetabotReactions,
  removeUserMessage,
  setVisible,
} from "./state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();
  const { getChatContext } = useMetabotContext();

  // TODO: fix typing issue
  const userMessages = useSelector(getUserMessages as any) as string[];

  const [sendMessage, sendMessageReq] = useMetabotAgentMutation({
    fixedCacheKey: "metabot",
  });

  return {
    visible: useSelector(getMetabotVisisble as any),
    setVisible: (isVisible: boolean) => {
      // TODO: do this in the setVisible action
      if (!isVisible) {
        sendMessageReq.reset();
      }

      dispatch(setVisible(isVisible));
    },
    userMessages,
    removeUserMessage: (messageIndex: number) =>
      dispatch(removeUserMessage(messageIndex)),
    // TODO: need to handle not sending messages while we're
    // processing playing through response messages
    sendMessage: async (message: string) => {
      dispatch(clearUserMessages());

      const context = getChatContext();
      const history = sendMessageReq.data?.history || [];
      const result = await sendMessage({ message, context, history });

      if (result.error) {
        throw result.error;
      }

      const reactions = result.data?.reactions || [];
      await dispatch(processMetabotReactions(reactions));
    },
    sendMessageReq,
  };
};
