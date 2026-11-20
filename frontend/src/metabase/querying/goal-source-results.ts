import { dynamicGoalApi } from "metabase/api/dynamic-goal";
import type { Dispatch } from "metabase/redux/store";
import { type GoalCard, getChartGoalSources } from "metabase/viz-core";
import type { GoalSourcesScope } from "metabase-types/api";

type PrefetchGoalSourceResultsOptions = {
  ignoreCache?: boolean;
};

/**
 * Starts fetching the results of the goal sources `card` reads, so they load
 * next to the chart's query. The chart reads them from the same cache entry.
 * Results already cached are reused, unless `ignoreCache` is set.
 */
export function prefetchGoalSourceResults(
  dispatch: Dispatch,
  scope: GoalSourcesScope,
  card: GoalCard,
  { ignoreCache = false }: PrefetchGoalSourceResultsOptions = {},
): void {
  const sources = getChartGoalSources(card);

  if (sources.length === 0) {
    return;
  }

  dispatch(
    dynamicGoalApi.endpoints.getGoalSourceResults.initiate(
      { ...scope, sources, ignore_cache: ignoreCache || undefined },
      { forceRefetch: ignoreCache, subscribe: false },
    ),
  );
}
