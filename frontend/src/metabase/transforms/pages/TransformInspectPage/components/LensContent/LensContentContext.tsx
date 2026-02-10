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

import type { LensQueryParams } from "../../types";

type LensContentContextValue = {
  transform: Transform;
  lens: InspectorLens;
  queryParams: LensQueryParams;
  alertsByCardId: Record<string, TriggeredAlert[]>;
  drillLensesByCardId: Record<string, TriggeredDrillLens[]>;
  collectedCardStats: Record<string, CardStats>;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onCardStartedLoading: (lensId: string, cardId: string) => void;
  onDrill: (lens: TriggeredDrillLens) => void;
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
  queryParams,
  alertsByCardId,
  drillLensesByCardId,
  collectedCardStats,
  onStatsReady,
  onCardStartedLoading,
  onDrill,
  children,
}: PropsWithChildren<LensContentContextValue>) => {
  const value = useMemo(
    () => ({
      transform,
      lens,
      queryParams,
      alertsByCardId,
      drillLensesByCardId,
      collectedCardStats,
      onStatsReady,
      onCardStartedLoading,
      onDrill,
    }),
    [
      transform,
      lens,
      queryParams,
      alertsByCardId,
      drillLensesByCardId,
      collectedCardStats,
      onStatsReady,
      onCardStartedLoading,
      onDrill,
    ],
  );

  return (
    <LensEvaluationContext.Provider value={value}>
      {children}
    </LensEvaluationContext.Provider>
  );
};
