import {
  type PropsWithChildren,
  createContext,
  useContext,
  useMemo,
} from "react";

import type {
  CardStats,
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type { InspectorLens, Transform } from "metabase-types/api";

import type { LensRef } from "../../types";

type LensContentContextValue = {
  transform: Transform;
  lens: InspectorLens;
  lensRef: LensRef;
  alertsByCardId: Record<string, TriggeredAlert[]>;
  drillLensesByCardId: Record<string, TriggeredDrillLens[]>;
  collectedCardStats: Record<string, CardStats>;
  navigateToLens: (lensRef: LensRef) => void;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onCardStartedLoading: (cardId: string) => void;
  onCardLoaded: (cardId: string) => void;
};

const LensEvaluationContext = createContext<
  LensContentContextValue | undefined
>(undefined);

export const useLensContentContext = (): LensContentContextValue => {
  const context = useContext(LensEvaluationContext);
  if (!context) {
    throw new Error(
      "useLensEvaluationContext must be used within a LensEvaluationProvider",
    );
  }
  return context;
};

export const LensContentProvider = ({
  transform,
  lens,
  lensRef,
  alertsByCardId,
  drillLensesByCardId,
  collectedCardStats,
  onStatsReady,
  onCardStartedLoading,
  onCardLoaded,
  navigateToLens,
  children,
}: PropsWithChildren<LensContentContextValue>) => {
  const value = useMemo(
    () => ({
      transform,
      lens,
      lensRef,
      alertsByCardId,
      drillLensesByCardId,
      collectedCardStats,
      onStatsReady,
      onCardStartedLoading,
      onCardLoaded,
      navigateToLens,
    }),
    [
      transform,
      lens,
      lensRef,
      alertsByCardId,
      drillLensesByCardId,
      collectedCardStats,
      onStatsReady,
      onCardStartedLoading,
      onCardLoaded,
      navigateToLens,
    ],
  );

  return (
    <LensEvaluationContext.Provider value={value}>
      {children}
    </LensEvaluationContext.Provider>
  );
};
