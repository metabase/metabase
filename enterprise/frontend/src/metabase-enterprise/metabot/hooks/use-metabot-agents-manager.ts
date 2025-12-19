import { useCallback } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import {
  type MetabotAgentId,
  createAgent as createAgentAction,
  destroyAgent,
  getActiveMetabotAgentIds,
  resetConversation,
} from "../state";

import { useMetabotDispatch, useMetabotSelector } from "./use-metabot-store";

type CreatePayload = Parameters<typeof createAgentAction>[0];
type DestroyPayload = Parameters<typeof destroyAgent>[0];
type ResetPayload = Parameters<typeof resetConversation>[0];

export const useMetabotAgentsManager = (
  autoStartAgentIds: MetabotAgentId[],
) => {
  const dispatch = useMetabotDispatch();
  const activeAgentIds = useMetabotSelector(getActiveMetabotAgentIds);

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
    resetConversation: useCallback(
      (p: ResetPayload) => dispatch(resetConversation(p)),
      [dispatch],
    ),
    destroyAgent: useCallback(
      (p: DestroyPayload) => dispatch(destroyAgent(p)),
      [dispatch],
    ),
  };
};
