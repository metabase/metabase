import { dynamicGoalApi } from "metabase/api/dynamic-goal";
import type { Dispatch } from "metabase/redux/store";
import { type GoalCard, getChartGoalSources } from "metabase/viz-core";
import type { GoalSourcesScope } from "metabase-types/api";

type FetchGoalSourceResultsOptions = {
  ignoreCache?: boolean;
};

/**
 * Fetches the results of the goal sources `card` reads, next to the chart's
 * query. Call it each time that query runs, so the goals refresh with it.
 * The chart reads them from the same cache entry.
 */
export function fetchGoalSourceResults(
  dispatch: Dispatch,
  scope: GoalSourcesScope,
  card: GoalCard,
  { ignoreCache = false }: FetchGoalSourceResultsOptions = {},
): void {
  initiateGoalSourceResults(dispatch, scope, card, {
    forceRefetch: true,
    ignoreCache,
  });
}

/**
 * Starts fetching the results of the goal sources `card` reads, unless they
 * are cached. For a chart whose query reuses its cached results the same way.
 */
export function prefetchGoalSourceResults(
  dispatch: Dispatch,
  scope: GoalSourcesScope,
  card: GoalCard,
): void {
  initiateGoalSourceResults(dispatch, scope, card, {
    forceRefetch: false,
    ignoreCache: false,
  });
}

async function initiateGoalSourceResults(
  dispatch: Dispatch,
  scope: GoalSourcesScope,
  card: GoalCard,
  {
    forceRefetch,
    ignoreCache,
  }: { forceRefetch: boolean; ignoreCache: boolean },
): Promise<void> {
  const sources = getChartGoalSources(card);

  if (sources.length === 0) {
    return;
  }

  const request = {
    ...scope,
    sources,
    ignore_cache: ignoreCache || undefined,
  };

  if (ignoreCache) {
    // RTK skips even a forced request while one with the same cache key is in flight
    await dispatch(
      dynamicGoalApi.util.getRunningQueryThunk("getGoalSourceResults", request),
    );
  }

  dispatch(
    dynamicGoalApi.endpoints.getGoalSourceResults.initiate(request, {
      forceRefetch,
      subscribe: false,
    }),
  );
}
