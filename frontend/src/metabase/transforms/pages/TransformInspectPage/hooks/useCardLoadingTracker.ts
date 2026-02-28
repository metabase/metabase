import { useCallback, useEffect, useMemo, useState } from "react";

import { useSubscriber } from "metabase/common/hooks";
import type { InspectorCardId } from "metabase-types/api";

type CardState = "loading" | "loaded";

export const useCardLoadingTracker = (onAllCardsLoaded: () => void) => {
  const [cardsStates, setCardsStates] = useState<
    Record<InspectorCardId, CardState>
  >({});

  const { emit, subscribe } = useSubscriber<InspectorCardId>();

  useEffect(() => {
    const states = Object.values(cardsStates);
    const isSomethingLoading = states.includes("loading");
    if (states.length > 0 && !isSomethingLoading) {
      onAllCardsLoaded();
    }
  }, [cardsStates, onAllCardsLoaded]);

  const markCard = useCallback(
    (state: CardState) => (cardId: InspectorCardId) => {
      setCardsStates((prev) =>
        prev[cardId] === state ? prev : { ...prev, [cardId]: state },
      );
      if (state === "loaded") {
        emit(cardId);
      }
    },
    [emit],
  );

  return useMemo(
    () => ({
      markCardLoaded: markCard("loaded"),
      markCardStartedLoading: markCard("loading"),
      subscribeToCardLoaded: subscribe,
    }),
    [markCard, subscribe],
  );
};
