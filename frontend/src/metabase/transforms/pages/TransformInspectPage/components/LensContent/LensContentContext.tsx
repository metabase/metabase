import { createContext, useContext, useMemo } from "react";

import type {
  CardStats,
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type { InspectorLens } from "metabase-types/api";

type LensContentContextValue = {
  lens: InspectorLens;
  alertsByCardId: Record<string, TriggeredAlert[]>;
  drillLensesByCardId: Record<string, TriggeredDrillLens[]>;
  collectedCardStats: Record<string, CardStats>;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
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

type LensContentProviderProps = LensContentContextValue & {
  children: React.ReactNode;
};

export const LensContentProvider = ({
  children,
  lens,
  alertsByCardId,
  drillLensesByCardId,
  collectedCardStats,
  onStatsReady,
  onDrill,
}: LensContentProviderProps) => {
  const value = useMemo(
    () => ({
      lens,
      alertsByCardId,
      drillLensesByCardId,
      collectedCardStats,
      onStatsReady,
      onDrill,
    }),
    [
      lens,
      alertsByCardId,
      drillLensesByCardId,
      collectedCardStats,
      onStatsReady,
      onDrill,
    ],
  );

  return (
    <LensEvaluationContext.Provider value={value}>
      {children}
    </LensEvaluationContext.Provider>
  );
};
