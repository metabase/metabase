import { useMemo } from "react";
import _ from "underscore";

import { useSelector } from "metabase/lib/redux";
import type { VisualizerDataSource } from "metabase-types/api";

import {
  getCards,
  getDatasets,
  getVisualizationColumns,
  getVisualizationType,
  getVisualizerColumnValuesMapping,
  getVisualizerRawSettings,
} from "../selectors";
import { getInitialStateForCardDataSource } from "../utils";

interface UseIsCardPristineOptions {
  source: VisualizerDataSource;
}

export function useIsCardPristine(options: UseIsCardPristineOptions): boolean {
  const { source } = options;

  const cards = useSelector(getCards);
  const datasets = useSelector(getDatasets);

  const display = useSelector(getVisualizationType);
  const columns = useSelector(getVisualizationColumns);
  const columnValuesMapping = useSelector(getVisualizerColumnValuesMapping);
  const settings = useSelector(getVisualizerRawSettings);

  return useMemo(() => {
    const card = cards.find((card) => card.id === source.sourceId);
    const dataset = datasets[source.id];

    if (!card || !dataset) {
      return false;
    }

    const newState = getInitialStateForCardDataSource(card, dataset);

    if (display !== newState.display) {
      return false;
    }

    if (!_.isEqual(columns, newState.columns)) {
      return false;
    }

    if (!_.isEqual(columnValuesMapping, newState.columnValuesMapping)) {
      return false;
    }

    if (!_.isEqual(settings, newState.settings)) {
      return false;
    }

    return true;
  }, [
    cards,
    datasets,
    display,
    columns,
    columnValuesMapping,
    settings,
    source.sourceId,
    source.id,
  ]);
}
