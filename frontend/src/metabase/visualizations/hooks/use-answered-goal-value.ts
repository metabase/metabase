import { match } from "ts-pattern";
import { t } from "ttag";

import {
  type GoalData,
  type GoalValueResult,
  getUnansweredGoalEntities,
  needsAnswer,
  resolveGoalValue,
} from "metabase/viz-core";
import type {
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
 * Like `resolveGoalValue`, but a foreign reference `data` has no answer for is
 * answered by fetching goal values: of `referencedEntities` when they include
 * the referenced entity, so sibling goals share one request, and of the
 * referenced entity alone otherwise.
 */
export function useAnsweredGoalValue({
  data,
  referencedEntities,
  value,
}: {
  data: GoalData;
  referencedEntities?: ReferencedEntity[];
  value: GoalValue | null | undefined;
}): GoalValueResult {
  const unansweredRef = getUnansweredRef(data, value);

  const answered = useAnsweredGoalData(
    data,
    unansweredRef !== null
      ? getEntitiesToAnswer(data, value, referencedEntities)
      : [],
  );

  return getAnsweredGoalValue(data, answered, value);
}

export function getAnsweredGoalValue(
  data: GoalData,
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

function getEntitiesToAnswer(
  data: GoalData,
  value: GoalValue | null | undefined,
  referencedEntities: ReferencedEntity[] | undefined,
): ReferencedEntity[] {
  const ownEntities = getUnansweredGoalEntities(data, [value]);
  const includesOwnEntities = ownEntities.every((own) =>
    referencedEntities?.some(
      (entity) => entity.type === own.type && entity.id === own.id,
    ),
  );

  return referencedEntities != null && includesOwnEntities
    ? referencedEntities
    : ownEntities;
}

function getUnansweredRef(
  data: GoalData,
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
