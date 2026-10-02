import { useCallback, useMemo } from "react";

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

type AgentSubmitInputOptions = SubmitInputOptions & {
  preventOpenSidebar?: boolean;
};

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

  const withSidebarReveal = useCallback(
    (options?: AgentSubmitInputOptions): SubmitInputOptions => ({
      ...options,
      onBeforeSubmit: () => {
        if (!visible && !options?.preventOpenSidebar) {
          setVisible(true);
        }
      },
    }),
    [setVisible, visible],
  );

  const submitInput = useCallback(
    (
      prompt: Parameters<typeof conversation.submitInput>[0],
      options?: AgentSubmitInputOptions,
    ) => conversation.submitInput(prompt, withSidebarReveal(options)),
    [conversation, withSidebarReveal],
  );

  const conversationContinueResponse = conversation.continueResponse;
  const continueResponse = useMemo(
    () =>
      conversationContinueResponse &&
      ((options?: AgentSubmitInputOptions) =>
        conversationContinueResponse(withSidebarReveal(options))),
    [conversationContinueResponse, withSidebarReveal],
  );

  return {
    ...conversation,
    submitInput,
    continueResponse,
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
