import { useDispatch, useSelector } from "metabase/lib/redux";
import { getQuestion } from "metabase/query_builder/selectors";
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
  const question = useSelector(getQuestion);

  // TODO: fix typing issue
  const userMessages = useSelector(getUserMessages as any) as string[];

  const [sendMessage, sendMessageReq] = useMetabotAgentMutation({
    fixedCacheKey: "metabot",
  });

  return {
    visible: useSelector(getMetabotVisisble as any),
    setVisible: (isVisible: boolean) => {
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
      await dispatch(processMetabotReactions(reactions));
    },
    sendMessageReq,
  };
};
