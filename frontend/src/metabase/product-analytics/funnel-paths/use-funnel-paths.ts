import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getPathColors } from "metabase/viz-core";
import type {
  ConcreteTableId,
  SingleSeries,
  UnsavedCard,
  VisualizationSettings,
} from "metabase-types/api";

import type { BaseQueryInput } from "../base-query";
import { buildSql } from "../build-sql";
import type { AnalysisSpec } from "../spec/types";
import {
  type FunnelPathsRange,
  OUTCOME_COLUMN,
  getOutcomeLabels,
  planFunnelPaths,
} from "../sql/analyses/funnel-paths";
import {
  getDatasetError,
  toNativeDatasetQuery,
  useCompiledBase,
} from "../use-analysis-query";

const FUNNEL_PATHS_STEPS = 5;
const FUNNEL_PATHS_MAX_NODES = 6;

const getVizSettings = (): VisualizationSettings => {
  const outcomes = getOutcomeLabels();
  const colors = getPathColors();
  return {
    "sankey.source": "source",
    "sankey.target": "target",
    "sankey.value": "weight",
    "sankey.breakout": OUTCOME_COLUMN,
    "sankey.breakout_colors": {
      [outcomes.converted]: colors.converted,
      [outcomes.notConverted]: colors.dropped,
    },
    "product_analytics.paths": true,
  };
};

type UseFunnelPathsArgs = {
  spec: AnalysisSpec | undefined;
  tableId: ConcreteTableId | undefined;
  /** Must keep its identity while unchanged. */
  base: BaseQueryInput;
  /** Undefined when the funnel has no paths to show. */
  range: FunnelPathsRange | undefined;
};

export type FunnelPaths = {
  /** The paths chart, once its result is in. */
  series: SingleSeries<UnsavedCard> | undefined;
  isLoading: boolean;
  error: string | undefined;
  warnings: string[];
};

/** Runs the paths query for a funnel's range of steps. */
export const useFunnelPaths = ({
  spec,
  tableId,
  base,
  range,
}: UseFunnelPathsArgs): FunnelPaths => {
  const vizSettings = useMemo(getVizSettings, []);
  const isReady = spec !== undefined && range !== undefined;
  const { compiled, isLoading, error } = useCompiledBase({
    isReady,
    tableId,
    base,
  });

  const built =
    isReady && compiled !== undefined
      ? buildSql(
          spec,
          compiled.sql,
          compiled.columns,
          planFunnelPaths(spec, {
            ...range,
            steps: FUNNEL_PATHS_STEPS,
            maxNodes: FUNNEL_PATHS_MAX_NODES,
          }),
        )
      : undefined;
  const datasetQuery =
    built !== undefined && compiled !== undefined
      ? toNativeDatasetQuery(built.sql, compiled.databaseId)
      : undefined;
  const adhoc = useGetAdhocQueryQuery(datasetQuery ?? skipToken);
  const data = adhoc.currentData?.data;

  return {
    series:
      datasetQuery !== undefined && data !== undefined
        ? {
            card: {
              display: "sankey",
              dataset_query: datasetQuery,
              visualization_settings: vizSettings,
            },
            data,
          }
        : undefined,
    isLoading: isLoading || adhoc.isFetching,
    error: error ?? getDatasetError(adhoc),
    warnings: built?.warnings ?? [],
  };
};
