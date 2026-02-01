import { useEffect, useRef, useState } from "react";

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
};

export const useTriggerEvaluation = (
  lens: InspectorLens | undefined,
  cardStats: Record<string, CardStats>,
  debounceMs = 100,
): TriggerEvaluationResult => {
  const [result, setResult] = useState<TriggerEvaluationResult>({
    alerts: [],
    drillLenses: [],
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lens) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const cardResults: Record<string, Record<string, unknown>> = {};
      for (const [cardId, stats] of Object.entries(cardStats)) {
        cardResults[cardId] = {
          "row-count": stats.rowCount,
          "first-row": stats.firstRow,
          "null-rate": stats.nullRate,
          "output-count": stats.outputCount,
          "matched-count": stats.matchedCount,
          "null-count": stats.nullCount,
        };
      }

      const evalResult = evaluateTriggers(lens, cardResults);

      setResult({
        alerts: evalResult.alerts,
        drillLenses: evalResult.drillLenses,
      });
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [lens, cardStats, debounceMs]);

  return result;
};
