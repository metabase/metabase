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

import { useAnsweredGoalData } from "./use-answered-goal-data";

const RESOLVING: GoalValueResult = {
  value: null,
  isUnanswered: true,
};

/**
 * Like `resolveGoalValue`, but a foreign reference the query can't answer is
 * answered by re-running the query with the referenced entities attached.
 */
export function useAnsweredGoalValue(
  query: DatasetQuery | undefined,
  data: DatasetData,
  value: GoalValue | null | undefined,
  referencedEntities: ReferencedEntity[] = getUnansweredGoalEntities(data, [
    value,
  ]),
): GoalValueResult {
  const resolved = resolveGoalValue(data, value);
  const unansweredRef =
    needsAnswer(resolved) && isGoalForeignColumnRef(value) ? value : null;

  const answered = useAnsweredGoalData(
    query,
    data,
    unansweredRef != null ? referencedEntities : [],
  );

  if (unansweredRef == null) {
    return resolved;
  }

  return match(answered)
    .with({ status: "resolving" }, () => RESOLVING)
    .with({ status: "failed" }, () => {
      return resolved.error != null
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
