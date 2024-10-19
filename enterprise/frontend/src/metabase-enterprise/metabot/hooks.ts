import { useMemo } from "react";

import { useDispatch } from "metabase/lib/redux";
import { useMetabotAgentMutation } from "metabase-enterprise/api";
import { isMetabotMessageReaction } from "metabase-types/api";

import { processMetabotMessages } from "./state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();

  const [sendMessage, sendMessageReq] = useMetabotAgentMutation({
    fixedCacheKey: "metabot",
  });

  const messages = useMemo(() => {
    const reactions = sendMessageReq.data?.reactions || [];
    return reactions.filter(isMetabotMessageReaction);
  }, [sendMessageReq]);

  return {
    messages,
    reset: sendMessageReq.reset,
    // TODO: need to handle not sending messages while we're
    // processing playing through response messages
    sendMessage: async (message: string) => {
      const result = await sendMessage({
        message,
        context: {}, // TODO: add plugin that selects context from state
        history: sendMessageReq.data?.history || [],
      });

      if (result.error) {
        throw result.error;
      }

      const reactions = result.data?.reactions || [];
      await dispatch(processMetabotMessages(reactions));
    },
    sendMessageReq,
  };
};
