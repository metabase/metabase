import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import {
  type ResolvedGoalValue,
  resolveGoalValue,
  toReferencedEntity,
} from "metabase/visualizations/lib/dynamic-goals";
import type { DatasetData, DatasetQuery, GoalValue } from "metabase-types/api";
import { isGoalForeignColumnRef } from "metabase-types/guards";

const RESOLVING: ResolvedGoalValue = {
  value: null,
  isResolving: true,
};

/**
 * Like `resolveGoalValue`, but a foreign reference the query can't answer
 * is resolved by re-running the question's query with the reference attached.
 */
export function useResolvedGoalValue(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData | undefined,
  value: GoalValue | null,
): ResolvedGoalValue {
  const resolved: ResolvedGoalValue =
    data == null ? { value: null } : resolveGoalValue(data, value);
  const isUnanswered =
    resolved.isResolving === true ||
    resolved.error?.reason === "column-not-found";
  const unansweredRef =
    isUnanswered && isGoalForeignColumnRef(value) ? value : null;

  const { data: freshDataset, isError } = useGetAdhocQueryQuery(
    unansweredRef != null && datasetQuery != null
      ? {
          ...datasetQuery,
          referenced_entities: [toReferencedEntity(unansweredRef)],
          ignore_error: true,
        }
      : skipToken,
  );

  if (unansweredRef == null) {
    return resolved;
  }

  if (isError || freshDataset?.error != null) {
    if (resolved.error != null) {
      return resolved;
    }

    const { type, id, column } = unansweredRef;
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

  if (freshDataset?.data == null) {
    return RESOLVING;
  }

  return resolveGoalValue(freshDataset.data, unansweredRef);
}
