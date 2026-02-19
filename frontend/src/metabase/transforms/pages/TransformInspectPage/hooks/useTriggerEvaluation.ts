import { useCallback, useEffect, useMemo, useState } from "react";
import _ from "underscore";

import {
  type TriggeredAlert,
  type TriggeredDrillLens,
  evaluateTriggers,
} from "metabase-lib/transforms-inspector";
import type { InspectorCardId, InspectorLens } from "metabase-types/api";

import type { CardStats } from "../types";

type TriggerEvaluationResult = {
  alertsByCardId: Record<InspectorCardId, TriggeredAlert[]>;
  drillLensesByCardId: Record<InspectorCardId, TriggeredDrillLens[]>;
  collectedCardStats: Record<InspectorCardId, CardStats>;
  pushNewStats: (cardId: InspectorCardId, stats: CardStats | null) => void;
};

type TriggerEvaluationState = {
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
};

export const useTriggerEvaluation = (
  lens: InspectorLens | undefined,
): TriggerEvaluationResult => {
  const [cardsStats, setCardsStats] = useState<
    Record<InspectorCardId, CardStats>
  >({});
  const [state, setState] = useState<TriggerEvaluationState>({
    alerts: [],
    drillLenses: [],
  });

  const pushNewStats = useCallback(
    (cardId: InspectorCardId, stats: CardStats | null) => {
      if (stats) {
        setCardsStats((prev) => ({ ...prev, [cardId]: stats }));
      }
    },
    [],
  );

  useEffect(() => {
    if (!lens) {
      return;
    }
    const result = evaluateTriggers(lens, cardsStats);
    setState({
      alerts: result.alerts,
      drillLenses: result.drill_lenses,
    });
  }, [lens, cardsStats]);

  const alertsByCardId = useMemo(
    () => _.groupBy(state.alerts, ({ condition }) => condition.card_id),
    [state.alerts],
  );

  const drillLensesByCardId = useMemo(
    () => _.groupBy(state.drillLenses, ({ condition }) => condition.card_id),
    [state.drillLenses],
  );

  return {
    collectedCardStats: cardsStats,
    alertsByCardId,
    drillLensesByCardId,
    pushNewStats,
  };
};
