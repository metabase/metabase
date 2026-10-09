import { match } from "ts-pattern";
import { t } from "ttag";

import {
  type GoalValueResult,
  getUnansweredGoalEntities,
  needsAnswer,
  resolveGoalValue,
} from "metabase/viz-core";
import type {
  DatasetData,
  DatasetQuery,
  GoalForeignColumnRef,
  GoalValue,
  ReferencedEntity,
} from "metabase-types/api";
import { isGoalForeignColumnRef } from "metabase-types/guards";

import {
  type GoalDataResolution,
  useAnsweredGoalData,
} from "./use-answered-goal-data";

const RESOLVING: GoalValueResult = {
  value: null,
  isUnanswered: true,
};

/**
 * Like `resolveGoalValue`, but a foreign reference the query can't answer is
 * answered by re-running the query with the referenced entities attached.
 */
export function useAnsweredGoalValue({
  data,
  datasetQuery,
  referencedEntities,
  value,
}: {
  data: DatasetData;
  datasetQuery: DatasetQuery | undefined;
  referencedEntities?: ReferencedEntity[];
  value: GoalValue | null | undefined;
}): GoalValueResult {
  const unansweredRef = getUnansweredRef(data, value);

  const answered = useAnsweredGoalData(
    datasetQuery,
    data,
    unansweredRef !== null
      ? (referencedEntities ?? getUnansweredGoalEntities(data, [value]))
      : [],
  );

  return getAnsweredGoalValue(data, answered, value);
}

/**
 * Resolves `value` against `answered`, the result of re-running the query for
 * the references `data` can't answer.
 */
export function getAnsweredGoalValue(
  data: DatasetData,
  answered: GoalDataResolution,
  value: GoalValue | null | undefined,
): GoalValueResult {
  const resolved = resolveGoalValue(data, value);
  const unansweredRef = getUnansweredRef(data, value);

  if (unansweredRef === null) {
    return resolved;
  }

  return match(answered)
    .with({ status: "resolving" }, () => RESOLVING)
    .with({ status: "failed" }, () => {
      return resolved.error !== undefined
        ? resolved
        : getFailedGoalValueResult(unansweredRef);
    })
    .with({ status: "resolved" }, ({ data: freshData }) => {
      const fresh = resolveGoalValue(freshData, unansweredRef);

      return fresh.isUnanswered === true
        ? getFailedGoalValueResult(unansweredRef)
        : fresh;
    })
    .exhaustive();
}

function getUnansweredRef(
  data: DatasetData,
  value: GoalValue | null | undefined,
): GoalForeignColumnRef | null {
  return isGoalForeignColumnRef(value) &&
    needsAnswer(resolveGoalValue(data, value))
    ? value
    : null;
}

function getFailedGoalValueResult({
  type,
  id,
  column,
}: GoalForeignColumnRef): GoalValueResult {
  return {
    value: null,
    error: {
      type,
      id,
      column,
      reason: "query-failed",
      message: t`Couldn't load this value`,
    },
  };
}
