import { skipToken, useGetGoalSourceResultsQuery } from "metabase/api";
import { useGoalSourcesScope } from "metabase/visualizations/components/GoalSourcesScope";
import type {
  GoalForeignEntityRef,
  GoalSourceResult,
  GoalSourceResults,
} from "metabase-types/api";

export type GoalSourceResultsState =
  | { status: "loading" }
  | { status: "loaded"; sourceResults: GoalSourceResults };

const NO_SOURCES: GoalSourceResultsState = {
  status: "loaded",
  sourceResults: {},
};

const FAILED_RESULT: GoalSourceResult = { status: "failed" };

/**
 * Results of the goal `sources`, from the route the closest
 * `GoalSourcesScopeProvider` picks. Every source fails when the request
 * fails, so a chart never waits on a goal that can't load.
 */
export function useGoalSourceResults(
  sources: GoalForeignEntityRef[],
): GoalSourceResultsState {
  const scope = useGoalSourcesScope();
  const { currentData, isError } = useGetGoalSourceResultsQuery(
    sources.length > 0 ? { ...scope, sources } : skipToken,
  );

  if (sources.length === 0) {
    return NO_SOURCES;
  }

  if (isError) {
    return { status: "loaded", sourceResults: getFailedResults(sources) };
  }

  if (currentData === undefined) {
    return { status: "loading" };
  }

  return { status: "loaded", sourceResults: currentData };
}

function getFailedResults(sources: GoalForeignEntityRef[]): GoalSourceResults {
  return sources.reduce<GoalSourceResults>(
    (results, { type, id }) => ({
      ...results,
      [type]: { ...results[type], [id]: FAILED_RESULT },
    }),
    {},
  );
}
