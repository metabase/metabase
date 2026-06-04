import { useCallback } from "react";
import { push, replace } from "react-router-redux";

import { useMetabotContext } from "metabase/metabot";
import { useDispatch } from "metabase/redux";
import { uuid } from "metabase/utils/uuid";

import {
  type MetabotAgentId,
  createAgent,
  submitInput as submitInputAction,
} from "../state";

export const useAskMetabotInNewTab = () => {
  const dispatch = useDispatch();
  const { getChatContext } = useMetabotContext();

  return useCallback(
    async (prompt: string, options?: { navigate?: "push" | "replace" }) => {
      const conversationId = uuid();
      const agentId: MetabotAgentId = `chat_${conversationId}`;
      dispatch(createAgent({ agentId, conversationId }));
      const navigate = options?.navigate === "replace" ? replace : push;
      dispatch(navigate(`/chat/${conversationId}`));
      const context = await getChatContext();
      await dispatch(
        submitInputAction({
          type: "text",
          message: prompt,
          context,
          agentId,
        }),
      );
      return agentId;
    },
    [dispatch, getChatContext],
  );
};
