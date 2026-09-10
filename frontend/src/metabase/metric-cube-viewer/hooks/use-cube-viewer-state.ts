import { useCallback, useEffect, useMemo, useState } from "react";

import type { MetricsViewerDisplayType } from "metabase/common/metrics-viewer";

import type {
  CardGenerator,
  CubeCard,
  CubeCatalog,
  CubeCoarseSettings,
} from "../generators/types";
import type { CubeFilters, CubeViewerState } from "../types";
import {
  addCard as addCardTransition,
  applyCoarseSettings as applyCoarseSettingsTransition,
  getInitialCubeViewerState,
  pruneForCatalog,
  removeCard as removeCardTransition,
  resetCubeViewer,
  setCardDisplay as setCardDisplayTransition,
  setFilters as setFiltersTransition,
  updateCard as updateCardTransition,
} from "../utils/viewer-state";

export interface CubeViewerActions {
  applyCoarseSettings(settings: CubeCoarseSettings): void;
  setCardDisplay(cardId: string, display: MetricsViewerDisplayType): void;
  addCard(card: CubeCard): void;
  updateCard(card: CubeCard): void;
  removeCard(cardId: string): void;
  setFilters(filters: CubeFilters): void;
  reset(): void;
}

export interface UseCubeViewerStateResult {
  /** `null` until the catalog is available. Reset when the generator id changes. */
  state: CubeViewerState | null;
  actions: CubeViewerActions;
}

export function useCubeViewerState({
  catalog,
  generator,
}: {
  catalog: CubeCatalog | null;
  generator: CardGenerator;
}): UseCubeViewerStateResult {
  const [state, setState] = useState<CubeViewerState | null>(null);

  // A new catalog object means a refetch (prune) or a new table (the catalog
  // passes through `null` in between, which clears the state).
  useEffect(() => {
    if (!catalog) {
      setState(null);
      return;
    }
    setState((prev) =>
      prev == null || prev.generatorId !== generator.id
        ? getInitialCubeViewerState(catalog, generator)
        : pruneForCatalog(prev, catalog, generator),
    );
  }, [catalog, generator]);

  const applyCoarseSettings = useCallback(
    (settings: CubeCoarseSettings) =>
      setState((prev) =>
        prev && catalog
          ? applyCoarseSettingsTransition(prev, catalog, generator, settings)
          : prev,
      ),
    [catalog, generator],
  );

  const setCardDisplay = useCallback(
    (cardId: string, display: MetricsViewerDisplayType) =>
      setState((prev) =>
        prev ? setCardDisplayTransition(prev, cardId, display) : prev,
      ),
    [],
  );

  const addCard = useCallback(
    (card: CubeCard) =>
      setState((prev) => (prev ? addCardTransition(prev, card) : prev)),
    [],
  );

  const updateCard = useCallback(
    (card: CubeCard) =>
      setState((prev) => (prev ? updateCardTransition(prev, card) : prev)),
    [],
  );

  const removeCard = useCallback(
    (cardId: string) =>
      setState((prev) => (prev ? removeCardTransition(prev, cardId) : prev)),
    [],
  );

  const setFilters = useCallback(
    (filters: CubeFilters) =>
      setState((prev) => (prev ? setFiltersTransition(prev, filters) : prev)),
    [],
  );

  const reset = useCallback(
    () => setState(catalog ? resetCubeViewer(catalog, generator) : null),
    [catalog, generator],
  );

  const actions = useMemo<CubeViewerActions>(
    () => ({
      applyCoarseSettings,
      setCardDisplay,
      addCard,
      updateCard,
      removeCard,
      setFilters,
      reset,
    }),
    [
      applyCoarseSettings,
      setCardDisplay,
      addCard,
      updateCard,
      removeCard,
      setFilters,
      reset,
    ],
  );

  return useMemo(() => ({ state, actions }), [state, actions]);
}
