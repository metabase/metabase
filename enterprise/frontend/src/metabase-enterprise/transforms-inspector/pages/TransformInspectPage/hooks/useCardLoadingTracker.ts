import { useCallback, useRef } from "react";

import type { InspectorCardId } from "metabase-types/api";
import { useSubscriber } from "metabase/common/hooks";

export const useCardLoadingTracker = (onAllCardsLoaded: () => void) => {
  const startedRef = useRef(new Set<InspectorCardId>());
  const loadedRef = useRef(new Set<InspectorCardId>());

  const { emit, subscribe } = useSubscriber<InspectorCardId>({
    withBuffer: true,
  });

  const markCardStartedLoading = useCallback((cardId: InspectorCardId) => {
    startedRef.current.add(cardId);
  }, []);

  const markCardLoaded = useCallback(
    (cardId: InspectorCardId) => {
      loadedRef.current.add(cardId);
      emit(cardId);
      if (
        startedRef.current.size > 0 &&
        startedRef.current.size === loadedRef.current.size
      ) {
        onAllCardsLoaded();
      }
    },
    [emit, onAllCardsLoaded],
  );

  return {
    markCardLoaded,
    markCardStartedLoading,
    subscribeToCardLoaded: subscribe,
  };
};
