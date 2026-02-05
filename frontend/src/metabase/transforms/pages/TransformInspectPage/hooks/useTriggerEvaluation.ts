import { useDebouncedValue } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";

import {
  type TriggeredAlert,
  type TriggeredDrillLens,
  evaluateTriggers,
} from "metabase-lib/transforms-inspector";
import type { InspectorLens } from "metabase-types/api";

import type { CardStats } from "../types";

type TriggerEvaluationResult = {
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
  pushNewStats: (cardId: string, stats: CardStats | null) => void;
};

type TriggerEvaluationState = {
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
};

export const useTriggerEvaluation = (
  lens: InspectorLens | undefined,
  debounceMs = 100,
): TriggerEvaluationResult => {
  const [cardsStats, setCardsStats] = useState<Record<string, CardStats>>({});
  const [state, setState] = useState<TriggerEvaluationState>({
    alerts: [],
    drillLenses: [],
  });

  const [debouncedCardsStats] = useDebouncedValue(cardsStats, debounceMs);

  const pushNewStats = useCallback(
    (cardId: string, stats: CardStats | null) => {
      if (!stats) {
        return;
      }
      setCardsStats((prev) => ({ ...prev, [cardId]: stats }));
    },
    [],
  );

  useEffect(() => {
    if (!lens) {
      return;
    }
    const result = evaluateTriggers(lens, debouncedCardsStats);
    setState({
      alerts: result.alerts,
      drillLenses: result.drill_lenses,
    });
  }, [lens, debouncedCardsStats]);

  return {
    ...state,
    pushNewStats,
  };
};
