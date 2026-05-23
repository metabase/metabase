import { useEffect, useRef } from "react";

import { useSelector } from "metabase/redux";

import { type MetabotAgentId, getPromptFocusToken } from "../state";

export const usePromptInputFocusEffect = (
  agentId: MetabotAgentId,
  onFocus: () => void,
) => {
  const focusToken = useSelector((state) =>
    getPromptFocusToken(state, agentId),
  );
  const lastFocusTokenRef = useRef(focusToken);

  useEffect(() => {
    if (focusToken !== lastFocusTokenRef.current) {
      lastFocusTokenRef.current = focusToken;
      onFocus();
    }
  }, [focusToken, onFocus]);
};
