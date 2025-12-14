import { useCallback } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { useDispatch, useSelector } from "metabase/lib/redux";

import {
  type MetabotConvoId,
  getActiveMetabotConvoIds,
  removeConversation,
  resetConversation,
  startConversation as startConversationAction,
} from "../state";

export const useMetabotConversationsManager = (
  autoStartConvoIds: MetabotConvoId[],
) => {
  const dispatch = useDispatch();

  const activeConvoIds = useSelector((state) =>
    getActiveMetabotConvoIds(state as any),
  );

  const startConversation = useCallback(
    (payload: Parameters<typeof startConversationAction>[0]) => {
      dispatch(startConversationAction(payload));
    },
    [dispatch],
  );

  useMount(() => {
    const convoIdsToStart = _.difference(autoStartConvoIds, activeConvoIds);
    convoIdsToStart.forEach((convoId) =>
      startConversation({ convoId, visible: false }),
    );
  });

  return {
    activeConvoIds,
    startConversation,
    removeConversation: useCallback(
      (payload: Parameters<typeof removeConversation>[0]) => {
        dispatch(removeConversation(payload));
      },
      [dispatch],
    ),
    resetConversation: useCallback(
      (payload: Parameters<typeof resetConversation>[0]) => {
        dispatch(resetConversation(payload));
      },
      [dispatch],
    ),
  };
};
