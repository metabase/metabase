import { useCallback } from "react";

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
    async (prompt: string) => {
      const agentId: MetabotAgentId = `chat_${uuid()}`;
      dispatch(createAgent({ agentId, visible: true, inBar: true }));
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
