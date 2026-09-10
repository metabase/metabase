import { useMemo } from "react";

import type { MetricsViewerDisplayType } from "metabase/common/metrics-viewer";
import { useDefinitionQueries } from "metabase/metrics-viewer/hooks/use-definition-queries";
import type { MetricsViewerSeries } from "metabase/metrics-viewer/types";
import { getDimensionBreakoutConfig } from "metabase/metrics-viewer/utils/dimension-breakout-config";
import {
  buildSeries,
  computeSourceBreakoutColors,
} from "metabase/metrics-viewer/utils/series";
import {
  type VizInput,
  isAllowedDisplay,
  useResolvedDisplay,
} from "metabase/visualizations/lib/viz-heuristics";
import type { Dataset, DatasetColumn } from "metabase-types/api";

import type { CardViewerModel } from "../utils/card-viewer-model";

export interface CubeCardTile {
  id: string;
  title: string;
  /** The user picked the card's display; a viz heuristic must not replace it. */
  isDisplayOverridden: boolean;
}

export interface UseCubeCardSeriesResult {
  series: MetricsViewerSeries[];
  /**
   * The display the series were built with: inside a VizHeuristicProvider the
   * heuristic's pick (unless overridden), otherwise the card's own display.
   */
  display: MetricsViewerDisplayType;
  queriesAreLoading: boolean;
  queriesError: string | null;
}

const EMPTY_COLUMNS: DatasetColumn[] = [];

export function useCubeCardSeries(
  model: CardViewerModel,
  cardDisplay: MetricsViewerDisplayType,
  tile: CubeCardTile,
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

  const display = useCubeCardDisplay(
    model,
    cardDisplay,
    tile,
    resultsByEntityIndex,
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

  return { series, display, queriesAreLoading, queriesError };
}

function useCubeCardDisplay(
  model: CardViewerModel,
  cardDisplay: MetricsViewerDisplayType,
  tile: CubeCardTile,
  resultsByEntityIndex: Map<number, Dataset>,
): MetricsViewerDisplayType {
  const { type } = model.dimensionBreakout;
  const allowed = useMemo(
    () =>
      getDimensionBreakoutConfig(type).availableDisplayTypes.map(
        (option) => option.type,
      ),
    [type],
  );
  const firstResult = useMemo(
    () => resultsByEntityIndex.values().next().value,
    [resultsByEntityIndex],
  );
  const vizInput = useMemo<VizInput>(
    () => ({
      cols: firstResult?.data.cols ?? EMPTY_COLUMNS,
      rows: firstResult?.data.rows,
      query: null,
      dimensionType: type,
      hint: { display: cardDisplay },
      allowed,
      context: "cube",
    }),
    [firstResult, type, cardDisplay, allowed],
  );
  const decision = useResolvedDisplay(tile.id, vizInput, tile.title);

  if (
    tile.isDisplayOverridden ||
    !isAllowedDisplay(decision.display, allowed)
  ) {
    return cardDisplay;
  }
  return decision.display;
}
