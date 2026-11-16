import { useGoalValuesQuery } from "metabase/visualizations/hooks/use-goal-values-query";
import {
  type GoalData,
  resolveGoalValue,
  toReferencedEntity,
} from "metabase/viz-core";
import type { GoalForeignEntityRef } from "metabase-types/api";

type ResolveColumnValue = (column: string) => number | null;

export function useEntityColumnValues(
  data: GoalData,
  entity: GoalForeignEntityRef | null,
  { enabled }: { enabled: boolean },
): ResolveColumnValue {
  const { currentData: goalValues } = useGoalValuesQuery(
    enabled && entity != null ? [toReferencedEntity(entity)] : [],
  );

  const sourceData: GoalData =
    goalValues != null ? { ...data, referenced_entities: goalValues } : data;

  return (column) => {
    if (entity == null) {
      return null;
    }

    return resolveGoalValue(sourceData, { ...entity, column }).value;
  };
}
