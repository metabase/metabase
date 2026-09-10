import { useMemo } from "react";

import type { MetricsViewerDisplayType } from "metabase/common/metrics-viewer";
import { useDefinitionQueries } from "metabase/metrics-viewer/hooks/use-definition-queries";
import type { MetricsViewerSeries } from "metabase/metrics-viewer/types";
import {
  buildSeries,
  computeSourceBreakoutColors,
} from "metabase/metrics-viewer/utils/series";

import type { CardViewerModel } from "../utils/card-viewer-model";

export interface UseCubeCardSeriesResult {
  series: MetricsViewerSeries[];
  queriesAreLoading: boolean;
  queriesError: string | null;
}

export function useCubeCardSeries(
  model: CardViewerModel,
  display: MetricsViewerDisplayType,
): UseCubeCardSeriesResult {
  const {
    resultsByEntityIndex,
    breakoutValuesByEntityIndex,
    queriesAreLoading,
    queriesError,
  } = useDefinitionQueries(
    model.definitions,
    model.formulaEntities,
    model.dimensionBreakout,
  );

  const sourceBreakoutColors = useMemo(
    () =>
      computeSourceBreakoutColors(
        model.formulaEntities,
        model.definitions,
        breakoutValuesByEntityIndex,
        model.entityNames,
      ),
    [
      model.formulaEntities,
      model.definitions,
      model.entityNames,
      breakoutValuesByEntityIndex,
    ],
  );

  const { series } = useMemo(
    () =>
      buildSeries({
        formulaEntities: model.formulaEntities,
        definitions: model.definitions,
        resultsByEntityIndex,
        display,
        sourceBreakoutColors,
        entityNames: model.entityNames,
      }),
    [
      model.formulaEntities,
      model.definitions,
      model.entityNames,
      resultsByEntityIndex,
      display,
      sourceBreakoutColors,
    ],
  );

  return { series, queriesAreLoading, queriesError };
}
