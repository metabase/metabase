import { useCallback, useRef } from "react";

import { useSubscriber } from "metabase/common/hooks";
import type { InspectorCardId } from "metabase-types/api";

export const useCardLoadingTracker = (onAllCardsLoaded: () => void) => {
  const startedRef = useRef(new Set<InspectorCardId>());
  const loadedRef = useRef(new Set<InspectorCardId>());
  const onAllCardsLoadedRef = useRef(onAllCardsLoaded);
  onAllCardsLoadedRef.current = onAllCardsLoaded;

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
        onAllCardsLoadedRef.current();
      }
    },
    [emit],
  );

  return {
    markCardLoaded,
    markCardStartedLoading,
    subscribeToCardLoaded: subscribe,
  };
};
