import { match } from "ts-pattern";
import { t } from "ttag";

import { useAnsweredGoalData } from "metabase/visualizations/hooks/use-answered-goal-data";
import {
  type ResolvedGoalValue,
  needsAnswer,
  resolveGoalValue,
} from "metabase/visualizations/lib/dynamic-goals";
import type {
  DatasetData,
  DatasetQuery,
  GoalForeignColumnRef,
  GoalValue,
  ReferencedEntity,
} from "metabase-types/api";
import { isGoalForeignColumnRef } from "metabase-types/guards";

const RESOLVING: ResolvedGoalValue = {
  value: null,
  isUnanswered: true,
};

/**
 * Like `resolveGoalValue`, but a foreign reference the query can't answer is
 * resolved by re-running the question's query with the references attached.
 */
export function useResolvedGoalValue(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  value: GoalValue | null,
  referencedEntities: ReferencedEntity[],
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
    .with({ status: "answered" }, ({ data: freshData }) => {
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
