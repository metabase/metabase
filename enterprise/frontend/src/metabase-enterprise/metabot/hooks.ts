import { useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { getQuestion } from "metabase/query_builder/selectors";
import { useMetabotAgentMutation } from "metabase-enterprise/api";
import { isMetabotMessageReaction } from "metabase-types/api";

import {
  getMetabotVisisble,
  processMetabotMessages,
  setVisible,
} from "./state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);

  const [sendMessage, sendMessageReq] = useMetabotAgentMutation({
    fixedCacheKey: "metabot",
  });

  const messages = useMemo(() => {
    const reactions = sendMessageReq.data?.reactions || [];
    return reactions.filter(isMetabotMessageReaction);
  }, [sendMessageReq]);

  return {
    visible: useSelector(getMetabotVisisble as any),
    setVisible: (isVisible: boolean) => {
      if (!isVisible) {
        sendMessageReq.reset();
      }

      dispatch(setVisible(isVisible));
    },
    messages,
    // TODO: need to handle not sending messages while we're
    // processing playing through response messages
    sendMessage: async (message: string) => {
      const result = await sendMessage({
        message,
        context: {
          // TODO: add plugin that selects context from state
          ...(question
            ? {
                question_id: question.id() || null,
                question_display_type: question.display(),
                available_fields: question
                  .metadata()
                  .fieldsList()
                  .map(field => ({
                    name: field.name,
                    data_type: field.base_type,
                    description: field.description,
                  })),
              }
            : {}),
        },
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
