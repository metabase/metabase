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
  lens: InspectorLens | undefined;
  lensHandle: LensHandle;
  alertsByCardId: Record<InspectorCardId, InspectorAlertTrigger[]>;
  drillLensesByCardId: Record<InspectorCardId, InspectorDrillLensTrigger[]>;
  collectedCardStats: Record<InspectorCardId, CardStats>;
  navigateToLens: (lensHandle: LensHandle) => void;
  pushNewStats: (cardId: InspectorCardId, stats: CardStats | null) => void;
  markCardStartedLoading: (cardId: InspectorCardId) => void;
  markCardLoaded: (cardId: InspectorCardId) => void;
  subscribeToCardLoaded: (cb: (cardId: InspectorCardId) => void) => () => void;
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
  pushNewStats,
  markCardStartedLoading,
  markCardLoaded,
  subscribeToCardLoaded,
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
      pushNewStats,
      markCardStartedLoading,
      markCardLoaded,
      subscribeToCardLoaded,
      navigateToLens,
    }),
    [
      transform,
      lens,
      lensHandle,
      alertsByCardId,
      drillLensesByCardId,
      collectedCardStats,
      pushNewStats,
      markCardStartedLoading,
      markCardLoaded,
      subscribeToCardLoaded,
      navigateToLens,
    ],
  );

  return (
    <LensEvaluationContext.Provider value={value}>
      {children}
    </LensEvaluationContext.Provider>
  );
};
