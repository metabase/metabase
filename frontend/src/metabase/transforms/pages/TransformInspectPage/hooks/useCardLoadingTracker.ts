import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { InspectorLens } from "metabase-types/api";

type CardState = "loading" | "loaded";

export const useCardLoadingTracker = (
  lens: InspectorLens | undefined,
  onAllCardsLoaded: (lensId: string) => void,
) => {
  const [cardsStates, setCardsStates] = useState<Record<string, CardState>>({});

  const prevLensIdRef = useRef(lens?.id);
  if (prevLensIdRef.current !== lens?.id) {
    prevLensIdRef.current = lens?.id;
    setCardsStates({});
  }

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
    (state: CardState) => (cardId: string) => {
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
