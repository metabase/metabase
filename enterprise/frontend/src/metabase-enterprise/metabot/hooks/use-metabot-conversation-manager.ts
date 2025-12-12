import { useCallback, useState } from "react";

import { useDispatch } from "metabase/lib/redux";

import {
  type MetabotConvoId,
  isFixedMetabotConvoId,
  newConversation,
  removeConversation,
} from "../state";
import { createConversationId } from "../state/reducer-utils";

export function useMetaboConversationManager(initialConvoId: MetabotConvoId): {
  convoId: MetabotConvoId;
  startNewConversation: () => MetabotConvoId;
} {
  const dispatch = useDispatch();

  const [convoId, setConvoId] = useState(
    initialConvoId ?? createConversationId(),
  );

  const refreshConvoId = useCallback(() => {
    if (convoId && isFixedMetabotConvoId(convoId)) {
      return convoId;
    } else {
      const newId = createConversationId();
      setConvoId(newId);
      return newId;
    }
  }, [convoId]);

  const startNewConversation = useCallback(() => {
    dispatch(removeConversation({ convoId, resetReactions: true }));
    const newConvoId = refreshConvoId();
    dispatch(newConversation({ convoId: newConvoId, visible: true }));
    setConvoId(newConvoId);
    return newConvoId;
  }, [convoId, dispatch, refreshConvoId]);

  return {
    convoId,
    startNewConversation,
  };
}
