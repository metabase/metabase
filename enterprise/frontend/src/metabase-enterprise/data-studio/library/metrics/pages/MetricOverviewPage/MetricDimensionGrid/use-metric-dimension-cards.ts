import { useCallback, useMemo, useState } from "react";

import { useMetricDefinition } from "metabase/metrics/common/hooks";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  SourceColorMap,
} from "metabase/metrics-viewer/types/viewer-state";
import type { AvailableDimensionsResult } from "metabase/metrics-viewer/utils/dimension-picker";
import {
  computeSourceDataById,
  getAvailableDimensionsForPicker,
} from "metabase/metrics-viewer/utils/dimension-picker";
import { computeSourceColors } from "metabase/metrics-viewer/utils/series";
import { createMetricSourceId } from "metabase/metrics-viewer/utils/source-ids";
import {
  computeDefaultTabs,
  createTabFromDimension,
  resolveEffectiveTabLabels,
} from "metabase/metrics-viewer/utils/tabs";
import type { MetricId } from "metabase-types/api/metric";

export function useMetricDimensionCards(metricId: MetricId) {
  const { definition, isLoading } = useMetricDefinition(metricId);

  const sourceId = createMetricSourceId(metricId);

  const definitions: MetricsViewerDefinitionEntry[] = useMemo(
    () => [{ id: sourceId, definition }],
    [sourceId, definition],
  );

  const [cards, setCards] = useState<MetricsViewerTabState[] | null>(null);

  if (definition && cards === null) {
    setCards(
      computeDefaultTabs({ [sourceId]: definition }, [sourceId]),
    );
  }

  const resolvedCards = useMemo(() => cards ?? [], [cards]);

  const effectiveCards = useMemo(
    () => resolveEffectiveTabLabels(resolvedCards, definitions),
    [resolvedCards, definitions],
  );

  const sourceColors: SourceColorMap = useMemo(
    () => computeSourceColors(definitions),
    [definitions],
  );

  const sourceDataById = useMemo(
    () => computeSourceDataById(definitions),
    [definitions],
  );

  const availableDimensions: AvailableDimensionsResult = useMemo(
    () =>
      getAvailableDimensionsForPicker(
        { [sourceId]: definition },
        [sourceId],
        new Set(resolvedCards.map((card) => card.id)),
      ),
    [sourceId, definition, resolvedCards],
  );

  const updateCard = useCallback(
    (cardId: string, updates: Partial<MetricsViewerTabState>) => {
      setCards((previous) =>
        (previous ?? []).map((card) =>
          card.id === cardId ? { ...card, ...updates } : card,
        ),
      );
    },
    [],
  );

  const addCard = useCallback(
    (dimensionId: string) => {
      const newCard = createTabFromDimension(
        dimensionId,
        { [sourceId]: definition },
        [sourceId],
      );
      if (newCard) {
        setCards((previous) => [...(previous ?? []), newCard]);
      }
    },
    [sourceId, definition],
  );

  return {
    cards: effectiveCards,
    definitions,
    sourceColors,
    availableDimensions,
    sourceOrder: [sourceId] as MetricSourceId[],
    sourceDataById,
    isLoading,
    updateCard,
    addCard,
  };
}
