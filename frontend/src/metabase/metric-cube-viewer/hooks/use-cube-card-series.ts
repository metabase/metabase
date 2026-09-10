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
  RENDERABLE_DISPLAYS,
  type VizDecision,
  type VizInput,
  isAllowedDisplay,
  useDatasetQuery,
  useResolvedDisplay,
} from "metabase/visualizations/lib/viz-heuristics";
import { STRUCTURED_QUERY_TEMPLATE } from "metabase-lib/v1/queries/StructuredQuery";
import type {
  CardDisplayType,
  Dataset,
  DatasetColumn,
  RawSeries,
} from "metabase-types/api";

import type { CardViewerModel } from "../utils/card-viewer-model";

export interface CubeCardTile {
  id: string;
  title: string;
  /** The user picked the card's display; a viz heuristic must not replace it. */
  isDisplayOverridden: boolean;
}

export interface UseCubeCardSeriesResult {
  series: MetricsViewerSeries[] | RawSeries;
  /**
   * The display the series were built with: inside a VizHeuristicProvider the
   * heuristic's pick (unless overridden), otherwise the card's own display.
   */
  display: CardDisplayType;
  queriesAreLoading: boolean;
  queriesError: string | null;
}

type CubeCardDisplay = {
  /** What the metrics-viewer pipeline builds the series with. */
  pipelineDisplay: MetricsViewerDisplayType;
  /**
   * Set when a heuristic chose a display outside the metrics viewer's registry
   * or emitted settings; the card is then drawn straight from its one result.
   */
  plain: { display: CardDisplayType; decision: VizDecision } | null;
};

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

  const { pipelineDisplay: display, plain } = useCubeCardDisplay(
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

  const plainSeries = useMemo(() => {
    const result = resultsByEntityIndex.values().next().value;
    return plain && result
      ? buildPlainSeries(result, plain.display, plain.decision)
      : null;
  }, [plain, resultsByEntityIndex]);

  if (plainSeries && plain) {
    return {
      series: plainSeries,
      display: plain.display,
      queriesAreLoading,
      queriesError,
    };
  }
  return { series, display, queriesAreLoading, queriesError };
}

function buildPlainSeries(
  dataset: Dataset,
  display: CardDisplayType,
  decision: VizDecision,
): RawSeries {
  const { cols } = dataset.data;
  const dimensionName = cols[0]?.name;
  const metricName = cols[1]?.name;
  return [
    {
      card: {
        display,
        visualization_settings: {
          ...(dimensionName ? { "graph.dimensions": [dimensionName] } : {}),
          ...(metricName ? { "graph.metrics": [metricName] } : {}),
          ...decision.settings,
        },
        dataset_query: dataset.json_query ?? STRUCTURED_QUERY_TEMPLATE,
      },
      data: dataset.data,
    },
  ];
}

function useCubeCardDisplay(
  model: CardViewerModel,
  cardDisplay: MetricsViewerDisplayType,
  tile: CubeCardTile,
  resultsByEntityIndex: Map<number, Dataset>,
): CubeCardDisplay {
  const { type } = model.dimensionBreakout;
  const pipelineDisplays = useMemo(
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
  // Multi-series and breakout cards must go through the metrics-viewer
  // pipeline, so only a single plain result may leave its display registry.
  const canRenderPlain =
    model.formulaEntities.length === 1 &&
    resultsByEntityIndex.size === 1 &&
    (firstResult?.data.cols.length ?? 0) <= 2;
  const allowed = canRenderPlain ? RENDERABLE_DISPLAYS : pipelineDisplays;
  const query = useDatasetQuery(firstResult);
  const vizInput = useMemo<VizInput>(
    () => ({
      cols: firstResult?.data.cols ?? EMPTY_COLUMNS,
      rows: firstResult?.data.rows,
      query,
      dimensionType: type,
      hint: { display: cardDisplay },
      allowed,
      context: "cube",
    }),
    [firstResult, query, type, cardDisplay, allowed],
  );
  const decision = useResolvedDisplay(tile.id, vizInput, tile.title);

  if (
    tile.isDisplayOverridden ||
    !isAllowedDisplay(decision.display, allowed)
  ) {
    return { pipelineDisplay: cardDisplay, plain: null };
  }
  const hasSettings =
    decision.settings != null && Object.keys(decision.settings).length > 0;
  if (isAllowedDisplay(decision.display, pipelineDisplays) && !hasSettings) {
    return { pipelineDisplay: decision.display, plain: null };
  }
  if (!canRenderPlain) {
    return { pipelineDisplay: cardDisplay, plain: null };
  }
  return {
    pipelineDisplay: cardDisplay,
    plain: { display: decision.display, decision },
  };
}
