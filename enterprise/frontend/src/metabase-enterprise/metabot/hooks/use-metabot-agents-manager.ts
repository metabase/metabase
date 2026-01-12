import { useCallback } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  type MetabotAgentId,
  createAgent as createAgentAction,
  destroyAgent,
  getActiveMetabotAgentIds,
  resetConversation,
} from "metabase/metabot/state";

type CreatePayload = Parameters<typeof createAgentAction>[0];
type DestroyPayload = Parameters<typeof destroyAgent>[0];
type ResetPayload = Parameters<typeof resetConversation>[0];

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
