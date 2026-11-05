import { useCallback } from "react";

import {
  getIsAskChatFloating,
  setIsAskChatFloating,
  setVisible,
  startNewConversation,
} from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";

/**
 * PROTOTYPE: opens the floating card on a blank ask conversation, or closes
 * the card when it is already open.
 */
export function useToggleFloatingChat() {
  const dispatch = useDispatch();
  const isFloating = useSelector(getIsAskChatFloating);

  const toggleFloatingChat = useCallback(() => {
    if (isFloating) {
      dispatch(setIsAskChatFloating(false));
      return;
    }
    dispatch(setVisible({ agentId: "omnibot", visible: false }));
    dispatch(startNewConversation({ agentId: "ask" }));
    dispatch(setIsAskChatFloating(true));
  }, [dispatch, isFloating]);

  return { isFloating, toggleFloatingChat };
}
