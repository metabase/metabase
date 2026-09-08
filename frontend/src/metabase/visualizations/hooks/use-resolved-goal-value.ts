import { match } from "ts-pattern";
import { t } from "ttag";

import {
  type ResolvedGoalValue,
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

const RESOLVING: ResolvedGoalValue = {
  value: null,
  isUnanswered: true,
};

/**
 * Like `resolveGoalValue`, but a foreign reference the query can't answer is
 * resolved by re-running the question's query with the references attached.
 * `referencedEntities` lets a caller with several inputs answer them all in
 * one query; by default only `value`'s own entity is asked for.
 */
export function useResolvedGoalValue(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  value: GoalValue | null | undefined,
  referencedEntities: ReferencedEntity[] = getUnansweredGoalEntities(data, [
    value,
  ]),
): ResolvedGoalValue {
  const resolved = resolveGoalValue(data, value);
  const unansweredRef =
    needsAnswer(resolved) && isGoalForeignColumnRef(value) ? value : null;

  const answered = useAnsweredGoalData(
    datasetQuery,
    data,
    unansweredRef != null ? referencedEntities : [],
  );

  if (unansweredRef == null) {
    return resolved;
  }

  return match(answered)
    .with({ status: "resolving" }, () => RESOLVING)
    .with({ status: "failed" }, () =>
      resolved.error != null ? resolved : queryFailed(unansweredRef),
    )
    .with({ status: "resolved" }, ({ data: freshData }) => {
      const fresh = resolveGoalValue(freshData, unansweredRef);
      return fresh.isUnanswered === true ? queryFailed(unansweredRef) : fresh;
    })
    .exhaustive();
}

function queryFailed({
  type,
  id,
  column,
}: GoalForeignColumnRef): ResolvedGoalValue {
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
