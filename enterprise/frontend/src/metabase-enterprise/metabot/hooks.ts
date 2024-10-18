import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotAgentMutation } from "metabase-enterprise/api";

import {
  type MetabotStoreState,
  getHistory,
  getLastMetabotChatMessages,
  processMetabotMessages,
  reset,
} from "./state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();

  const [sendMessage, sendMessageReq] = useMetabotAgentMutation({
    fixedCacheKey: "metabot",
  });

  // TODO: add a proper EnterpriseState defintion + useEnterpriseSelector fn
  const history = useSelector(state => getHistory(state as MetabotStoreState));
  const lastMetabotChatMessages = useSelector(state =>
    getLastMetabotChatMessages(state as MetabotStoreState),
  );

  return {
    lastMetabotChatMessages,
    reset: () => dispatch(reset()),
    // TODO: need to handle not sending messages while we're
    // processing playing through response messages
    sendMessage: async (message: string) => {
      const result = await sendMessage({
        message,
        context: {}, // TODO: add plugin that selects context from state
        messages: history,
      });

      if (result.error) {
        throw result.error;
      }

      await dispatch(processMetabotMessages(result.data || []));
    },
    sendMessageReq,
  };
};
