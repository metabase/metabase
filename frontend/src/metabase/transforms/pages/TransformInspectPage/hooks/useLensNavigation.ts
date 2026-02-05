import { useCallback, useEffect, useState } from "react";

import type { LensRef, LensStackEntry } from "../types";

type UseLensNavigationResult = {
  currentLensRef: LensRef | undefined;
  stack: LensStackEntry[];
  parentSiblings: LensRef[];
  currentSiblings: LensRef[];
  drillLenses: LensRef[];
  setDrillLenses: (lenses: LensRef[]) => void;
  drill: (lensRef: LensRef) => void;
  zoomOut: () => void;
  setCurrentLens: (lensRef: LensRef) => void;
  selectParentLens: (lensRef: LensRef) => void;
  canZoomOut: boolean;
};

export const useLensNavigation = (
  initialLensRef: LensRef | undefined,
  rootSiblings: LensRef[],
): UseLensNavigationResult => {
  const [currentLensRef, setCurrentLensRef] = useState<LensRef | undefined>(
    initialLensRef,
  );
  const [currentSiblings, setCurrentSiblings] =
    useState<LensRef[]>(rootSiblings);

  useEffect(() => {
    if (initialLensRef?.id && !currentLensRef?.id) {
      setCurrentLensRef(initialLensRef);
    }
  }, [initialLensRef, currentLensRef?.id]);

  useEffect(() => {
    if (rootSiblings.length > 0 && currentSiblings.length === 0) {
      setCurrentSiblings(rootSiblings);
    }
  }, [rootSiblings, currentSiblings.length]);

  const [stack, setStack] = useState<LensStackEntry[]>([]);
  const [drillLenses, setDrillLenses] = useState<LensRef[]>([]);

  const parentSiblings =
    stack.length > 0 ? stack[stack.length - 1].siblings : [];

  const drill = useCallback(
    (lensRef: LensRef) => {
      if (!currentLensRef) {
        return;
      }
      setStack((prev) => [
        ...prev,
        {
          lensRef: currentLensRef,
          siblings: currentSiblings,
          drillSiblings: drillLenses,
        },
      ]);
      setCurrentLensRef(lensRef);
      setCurrentSiblings(drillLenses);
      setDrillLenses([]);
    },
    [currentLensRef, currentSiblings, drillLenses],
  );

  const zoomOut = useCallback(() => {
    if (stack.length === 0) {
      return;
    }
    const prev = stack[stack.length - 1];
    setStack((s) => s.slice(0, -1));
    setCurrentLensRef(prev.lensRef);
    setCurrentSiblings(prev.siblings);
    setDrillLenses(prev.drillSiblings);
  }, [stack]);

  const setCurrentLens = useCallback((lensRef: LensRef) => {
    setCurrentLensRef(lensRef);
  }, []);

  const selectParentLens = useCallback(
    (lensRef: LensRef) => {
      if (stack.length === 0) {
        return;
      }
      const prev = stack[stack.length - 1];
      setStack((s) => s.slice(0, -1));
      setCurrentLensRef(lensRef);
      setCurrentSiblings(prev.siblings);
    },
    [stack],
  );

  return {
    currentLensRef,
    stack,
    parentSiblings,
    currentSiblings,
    drillLenses,
    setDrillLenses,
    drill,
    zoomOut,
    setCurrentLens,
    selectParentLens,
    canZoomOut: stack.length > 0,
  };
};
