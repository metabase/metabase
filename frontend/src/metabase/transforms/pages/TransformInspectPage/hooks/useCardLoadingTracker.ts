import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  InspectorCardId,
  InspectorLens,
  InspectorLensId,
} from "metabase-types/api";

type CardState = "loading" | "loaded";

export const useCardLoadingTracker = (
  lens: InspectorLens | undefined,
  onAllCardsLoaded: (lensId: InspectorLensId) => void,
) => {
  const [cardsStates, setCardsStates] = useState<
    Record<InspectorCardId, CardState>
  >({});

  useEffect(() => {
    if (!lens) {
      return;
    }
    const states = Object.values(cardsStates);
    const isSomethingLoading = states.includes("loading");
    if (states.length > 0 && !isSomethingLoading) {
      onAllCardsLoaded(lens.id);
    }
  }, [lens, cardsStates, onAllCardsLoaded]);

  const markCard = useCallback(
    (state: CardState) => (cardId: InspectorCardId) => {
      setCardsStates((prev) =>
        prev[cardId] === state ? prev : { ...prev, [cardId]: state },
      );
    },
    [],
  );

  return useMemo(
    () => ({
      markCardLoaded: markCard("loaded"),
      markCardStartedLoading: markCard("loading"),
    }),
    [markCard],
  );
};
