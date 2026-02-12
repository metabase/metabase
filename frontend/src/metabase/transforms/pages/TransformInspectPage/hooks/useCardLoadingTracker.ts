import { useCallback, useEffect, useState } from "react";

import type { InspectorLens } from "metabase-types/api";

export const useCardLoadingTracker = (
  lens: InspectorLens | undefined,
  onAllCardsLoaded: (lensId: string) => void,
) => {
  const [lenses, setLenses] = useState<Record<string, InspectorLens>>({});
  const [loadingCardsByLensId, setLoadingCardsByLensId] = useState<
    Record<string, Set<string>>
  >({});
  const [loadedCardsByLensId, setLoadedCardsByLensId] = useState<
    Record<string, Set<string>>
  >({});

  useEffect(() => {
    if (!lens) {
      return;
    }
    setLenses((prev) => ({ ...prev, [lens.id]: lens }));
  }, [lens]);

  useEffect(() => {
    Object.entries(lenses).forEach(([lensId]) => {
      const loadedCards = loadedCardsByLensId[lensId];
      const loadingCards = loadingCardsByLensId[lensId];

      if (!loadedCards || !loadingCards) {
        return;
      }

      const allStartedCardsHaveLoaded = [...loadingCards].every((cardId) =>
        loadedCards.has(cardId),
      );

      if (loadedCards.size > 0 && allStartedCardsHaveLoaded) {
        onAllCardsLoaded(lensId);
      }
    });
  }, [lenses, loadedCardsByLensId, loadingCardsByLensId, onAllCardsLoaded]);

  const markCardStartedLoading = useCallback(
    (lensId: string, cardId: string) => {
      setLoadingCardsByLensId((prev) => {
        const loadingCards = prev[lensId] ?? new Set<string>();
        if (loadingCards.has(cardId)) {
          return prev;
        }
        return {
          ...prev,
          [lensId]: new Set(loadingCards).add(cardId),
        };
      });
    },
    [],
  );

  const markCardLoaded = useCallback((lensId: string, cardId: string) => {
    setLoadedCardsByLensId((prev) => {
      const loadedCards = prev[lensId] ?? new Set<string>();
      if (loadedCards.has(cardId)) {
        return prev;
      }
      return {
        ...prev,
        [lensId]: new Set(loadedCards).add(cardId),
      };
    });
  }, []);

  return {
    markCardLoaded,
    markCardStartedLoading,
  };
};
