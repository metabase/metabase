import { useMemo } from "react";

import type { Dispatch } from "metabase/redux/store";
import type {
  Dataset,
  ReferencedEntitiesResults,
  ReferencedEntity,
  ReferencedEntityResult,
} from "metabase-types/api";

type GoalValuesEndpoint<Arg> = {
  Types: { ResultType: ReferencedEntitiesResults };
  initiate(arg: Arg, options: { forceRefetch: boolean }): unknown;
};

type GoalValuesSubscription = {
  abort: () => void;
  unsubscribe: () => void;
  unwrap: () => Promise<ReferencedEntitiesResults>;
};

type FetchGoalValuesOptions = {
  sources: ReferencedEntity[];
  forceRefetch?: boolean;
  signal?: AbortSignal;
};

const FAILED_GOAL_VALUE: ReferencedEntityResult = { status: "failed" };

/**
 * Fetches the values of a chart's goal `sources` from a goal route. Resolves to
 * `null` when the chart has no sources, and to failed results when the request
 * fails, so the chart never waits on a goal that can't load. Never rejects.
 */
export async function fetchGoalValues<Arg>(
  dispatch: Dispatch,
  endpoint: GoalValuesEndpoint<Arg>,
  request: Arg,
  { sources, forceRefetch = false, signal }: FetchGoalValuesOptions,
): Promise<ReferencedEntitiesResults | null> {
  if (sources.length === 0) {
    return null;
  }

  // RTK query thunks dispatch to a subscription, and `Types` pins what `unwrap` resolves to
  const subscription = dispatch(
    endpoint.initiate(request, { forceRefetch }),
  ) as GoalValuesSubscription;
  const abort = () => subscription.abort();
  if (signal?.aborted) {
    abort();
  }
  signal?.addEventListener("abort", abort);

  try {
    return await subscription.unwrap();
  } catch {
    return getFailedGoalValues(sources);
  } finally {
    signal?.removeEventListener("abort", abort);
    subscription.unsubscribe();
  }
}

/**
 * Waits for a chart query and its goal values, so the chart and its goals show
 * together, and puts the goal values where the visualizations read them.
 */
export async function withGoalValues(
  datasetPromise: Promise<Dataset>,
  goalValuesPromise: Promise<ReferencedEntitiesResults | null>,
): Promise<Dataset> {
  const [dataset, goalValues] = await Promise.all([
    datasetPromise,
    goalValuesPromise,
  ]);

  return addGoalValues(dataset, goalValues);
}

type GoalValuesQueryState = {
  data?: ReferencedEntitiesResults;
  isLoading: boolean;
  isError: boolean;
};

/**
 * Hook version of `withGoalValues`: `undefined` until both the dataset and its
 * goal values load, so the chart and its goals show together.
 */
export function useDatasetWithGoalValues(
  dataset: Dataset | undefined,
  sources: ReferencedEntity[],
  { data: goalValues, isLoading, isError }: GoalValuesQueryState,
): Dataset | undefined {
  return useMemo(() => {
    if (dataset === undefined || isLoading) {
      return undefined;
    }

    return addGoalValues(
      dataset,
      isError ? getFailedGoalValues(sources) : (goalValues ?? null),
    );
  }, [dataset, sources, goalValues, isLoading, isError]);
}

function addGoalValues(
  dataset: Dataset,
  goalValues: ReferencedEntitiesResults | null,
): Dataset {
  // a failed query has no `data`, despite its type
  if (goalValues === null || dataset.data == null) {
    return dataset;
  }

  return {
    ...dataset,
    data: { ...dataset.data, referenced_entities: goalValues },
  };
}

function getFailedGoalValues(
  sources: ReferencedEntity[],
): ReferencedEntitiesResults {
  return {
    card: getFailedResultsById(sources, "card"),
    measure: getFailedResultsById(sources, "measure"),
  };
}

function getFailedResultsById(
  sources: ReferencedEntity[],
  type: ReferencedEntity["type"],
): Record<number, ReferencedEntityResult> {
  return Object.fromEntries(
    sources
      .filter((source) => source.type === type)
      .map((source) => [source.id, FAILED_GOAL_VALUE]),
  );
}
