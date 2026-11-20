import { useEffect, useRef } from "react";

import {
  fetchGoalSourceResults,
  prefetchGoalSourceResults,
} from "metabase/querying/goal-source-results";
import { useDispatch } from "metabase/redux";
import type { GoalCard } from "metabase/viz-core";
import type { GoalSourcesScope } from "metabase-types/api";

type UseCardEmbedGoalSourceResultsOpts = {
  card: GoalCard | undefined;
  datasetFetchStartedAt: number | undefined;
  scope: GoalSourcesScope;
  skip: boolean;
};

/**
 * Starts fetching the results of the goal sources `card` reads, next to the
 * card's query. Cached results are reused while the query reuses its cached
 * result, and fetched again each time the query runs again.
 */
export function useCardEmbedGoalSourceResults({
  card,
  datasetFetchStartedAt,
  scope,
  skip,
}: UseCardEmbedGoalSourceResultsOpts): void {
  const dispatch = useDispatch();
  const latestFetchStartedAtRef = useRef(datasetFetchStartedAt);

  useEffect(() => {
    if (skip || card == null) {
      return;
    }

    const latestFetchStartedAt = latestFetchStartedAtRef.current;
    const isNewerFetch =
      datasetFetchStartedAt != null &&
      (latestFetchStartedAt == null ||
        datasetFetchStartedAt > latestFetchStartedAt);

    if (isNewerFetch) {
      latestFetchStartedAtRef.current = datasetFetchStartedAt;
    }

    if (isNewerFetch && latestFetchStartedAt != null) {
      fetchGoalSourceResults(dispatch, scope, card);
    } else {
      prefetchGoalSourceResults(dispatch, scope, card);
    }
  }, [card, datasetFetchStartedAt, dispatch, scope, skip]);
}
