import { useDebouncedValue } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type TriggeredAlert,
  type TriggeredDrillLens,
  evaluateTriggers,
} from "metabase-lib/transforms-inspector";
import type { InspectorLens, InspectorLensMetadata } from "metabase-types/api";

import type { CardStats, LensRef } from "../types";
import { convertDrillLensToRef } from "../utils";

type TriggerEvaluationResult = {
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
  drillLensesRefs: LensRef[];
  pushNewStats: (cardId: string, stats: CardStats | null) => void;
};

type TriggerEvaluationState = {
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
};

export const useTriggerEvaluation = (
  lens: InspectorLens | undefined,
  availableLenses: InspectorLensMetadata[],
  debounceMs = 100,
): TriggerEvaluationResult => {
  const [cardsStats, setCardsStats] = useState<Record<string, CardStats>>({});
  const [state, setState] = useState<TriggerEvaluationState>({
    alerts: [],
    drillLenses: [],
  });

  const [debouncedCardsStats] = useDebouncedValue(cardsStats, debounceMs);

  const lensesMap = useMemo(
    () => new Map(availableLenses.map((lens) => [lens.id, lens])),
    [availableLenses],
  );

  const drillLensesRefs = useMemo(
    () =>
      state.drillLenses.map((lens) => convertDrillLensToRef(lens, lensesMap)),
    [state.drillLenses, lensesMap],
  );

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
    setState(evaluateTriggers(lens, debouncedCardsStats));
  }, [lens, debouncedCardsStats]);

  return {
    alerts: state.alerts,
    drillLenses: state.drillLenses,
    drillLensesRefs,
    pushNewStats,
  };
};
