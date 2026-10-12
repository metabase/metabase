import { useCallback } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/redux";

import {
  type MetabotAgentId,
  createAgent as createAgentAction,
  destroyAgent,
  getActiveMetabotAgentIds,
  startNewConversation,
} from "../state";

type CreatePayload = Parameters<typeof createAgentAction>[0];
type DestroyPayload = Parameters<typeof destroyAgent>[0];
type StartNewConversationPayload = Parameters<typeof startNewConversation>[0];

export const useMetabotAgentsManager = (
  autoStartAgentIds: MetabotAgentId[],
) => {
  const dispatch = useDispatch();
  const activeAgentIds = useSelector(getActiveMetabotAgentIds);

  useMount(() => {
    const agentIdsToStart = _.difference(autoStartAgentIds, activeAgentIds);
    agentIdsToStart.forEach((agentId) =>
      dispatch(createAgentAction({ agentId, visible: false })),
    );
  });

  return {
    activeAgentIds,
    createAgent: useCallback(
      (p: CreatePayload) => dispatch(createAgentAction(p)),
      [dispatch],
    ),
    startNewConversation: useCallback(
      (p: StartNewConversationPayload) => dispatch(startNewConversation(p)),
      [dispatch],
    ),
    destroyAgent: useCallback(
      (p: DestroyPayload) => dispatch(destroyAgent(p)),
      [dispatch],
    ),
  };
};
