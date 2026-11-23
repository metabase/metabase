import {
  type GoalData,
  type GoalValueResult,
  getGoalSources,
  resolveGoalValue,
} from "metabase/viz-core";
import type {
  GoalForeignEntityRef,
  GoalSourceResults,
  GoalValue,
} from "metabase-types/api";
import { isGoalForeignColumnRef } from "metabase-types/guards";

import { useGoalSourceResults } from "./use-goal-source-results";

export type ResolvedGoalValues =
  | {
      status: "resolving";
    }
  | {
      status: "resolved";
      sourceResults: GoalSourceResults;
      results: GoalValueResult[];
    };

const LOADING: GoalValueResult = { value: null, isLoading: true };

export function useResolvedGoalValues(
  data: GoalData,
  values: (GoalValue | null)[],
): ResolvedGoalValues {
  const state = useGoalSourceResults(getGoalSources(values));

  if (state.status === "loading") {
    return { status: "resolving" };
  }

  return {
    status: "resolved",
    sourceResults: state.sourceResults,
    results: values.map((value) => {
      return resolveGoalValue(data, state.sourceResults, value);
    }),
  };
}

/**
 * Like `useResolvedGoalValues`, for one value. Fetching all of `sources` lets
 * inputs that edit goals of the same chart share one request.
 */
export function useResolvedGoalValue({
  data,
  sources,
  value,
}: {
  data: GoalData;
  sources: GoalForeignEntityRef[];
  value: GoalValue | null;
}): GoalValueResult {
  const state = useGoalSourceResults(sources);

  if (state.status === "loaded") {
    return resolveGoalValue(data, state.sourceResults, value);
  }

  return isGoalForeignColumnRef(value)
    ? LOADING
    : resolveGoalValue(data, {}, value);
}
