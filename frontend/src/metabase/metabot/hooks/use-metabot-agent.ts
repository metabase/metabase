import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/redux";

import {
  type MetabotAgentId,
  getMetabotConversationId,
  getMetabotVisible,
  loadConversation as loadConversationAction,
  setVisible as setVisibleAction,
  startNewConversation as startNewConversationAction,
} from "../state";

import {
  type SubmitInputOptions,
  useMetabotConversation,
} from "./use-metabot-conversation";

export const useMetabotAgent = (agentId: MetabotAgentId = "omnibot") => {
  const dispatch = useDispatch();
  const conversationId = useSelector((state) =>
    getMetabotConversationId(state, agentId),
  );
  const conversation = useMetabotConversation(conversationId);
  const visible = useSelector((state) => getMetabotVisible(state, agentId));

  const setVisible = useCallback(
    (visible: boolean) => dispatch(setVisibleAction({ agentId, visible })),
    [dispatch, agentId],
  );

  const submitInput = useCallback(
    (
      prompt: Parameters<typeof conversation.submitInput>[0],
      options?: SubmitInputOptions & { preventOpenSidebar?: boolean },
    ) =>
      conversation.submitInput(prompt, {
        ...options,
        onBeforeSubmit: () => {
          if (!visible && !options?.preventOpenSidebar) {
            setVisible(true);
          }
        },
      }),
    [conversation, setVisible, visible],
  );

  return {
    ...conversation,
    submitInput,
    visible,
    setVisible,
    createNewConversation: useCallback(
      () => dispatch(startNewConversationAction({ agentId })),
      [agentId, dispatch],
    ),
    loadConversation: useCallback(
      (conversationId: string) =>
        dispatch(loadConversationAction({ agentId, conversationId })),
      [agentId, dispatch],
    ),
  };
};
