import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import type { ConcreteTableId } from "metabase-types/api";

import type { BaseQueryInput } from "../base-query";
import { buildSql } from "../build-sql";
import type { AnalysisSpec } from "../spec/types";
import {
  canShowEntrances,
  canShowExits,
  planPathSteps,
} from "../sql/analyses/path-steps";
import {
  getDatasetError,
  toNativeDatasetQuery,
  useCompiledBase,
} from "../use-analysis-query";

import { type PathStep, parsePathStepRows } from "./rows";

type UsePathStepsArgs = {
  /** Nothing runs unless it's a paths spec. */
  spec: AnalysisSpec | undefined;
  tableId: ConcreteTableId | undefined;
  /** Must keep its identity while unchanged. */
  base: BaseQueryInput;
};

export type PathSteps = {
  /** Undefined until the result is in. */
  steps: PathStep[] | undefined;
  /** Whether the paths can start at a visit's first step; see `canShowEntrances`. */
  showsEntrances: boolean;
  /** Whether the paths can end at a visit's last step; see `canShowExits`. */
  showsExits: boolean;
  isLoading: boolean;
  error: string | undefined;
  warnings: string[];
};

/** Runs the steps query for a paths analysis. */
export const usePathSteps = ({
  spec,
  tableId,
  base,
}: UsePathStepsArgs): PathSteps => {
  const paths = spec?.kind === "paths" ? spec.paths : undefined;
  const isReady = spec !== undefined && paths !== undefined;
  const { compiled, isLoading, error } = useCompiledBase({
    isReady,
    tableId,
    base,
  });

  const built =
    isReady && compiled !== undefined
      ? buildSql(spec, compiled.sql, compiled.columns, planPathSteps(spec))
      : undefined;
  const datasetQuery =
    built !== undefined && compiled !== undefined
      ? toNativeDatasetQuery(built.sql, compiled.databaseId)
      : undefined;
  const adhoc = useGetAdhocQueryQuery(datasetQuery ?? skipToken);
  const dataset = adhoc.currentData;

  const steps = useMemo(
    () =>
      dataset?.data !== undefined && !dataset.error
        ? parsePathStepRows(
            dataset.data.cols.map(({ name }) => name),
            dataset.data.rows,
          )
        : undefined,
    [dataset],
  );

  return {
    steps,
    showsEntrances: paths !== undefined && canShowEntrances(paths),
    showsExits: paths !== undefined && canShowExits(paths),
    isLoading: isLoading || adhoc.isFetching,
    error: error ?? getDatasetError(adhoc),
    warnings: built?.warnings ?? [],
  };
};
