import {
  type PropsWithChildren,
  createContext,
  useContext,
  useMemo,
} from "react";

import type { CardStats } from "metabase/transforms/lib/transforms-inspector";
import type {
  InspectorAlertTrigger,
  InspectorCardId,
  InspectorDrillLensTrigger,
  InspectorLens,
  Transform,
} from "metabase-types/api";

import type { LensHandle } from "../../types";

type LensContentContextValue = {
  transform: Transform;
  lens: InspectorLens;
  lensHandle: LensHandle;
  alertsByCardId: Record<InspectorCardId, InspectorAlertTrigger[]>;
  drillLensesByCardId: Record<InspectorCardId, InspectorDrillLensTrigger[]>;
  collectedCardStats: Record<InspectorCardId, CardStats>;
  navigateToLens: (lensHandle: LensHandle) => void;
  onStatsReady: (cardId: InspectorCardId, stats: CardStats | null) => void;
  onCardStartedLoading: (cardId: InspectorCardId) => void;
  onCardLoaded: (cardId: InspectorCardId) => void;
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
  lensHandle,
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
      lensHandle,
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
      lensHandle,
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
