import { useReferencedEntitiesQuery } from "metabase/visualizations/hooks/use-referenced-entities-query";
import { resolveGoalValue, toReferencedEntity } from "metabase/viz-core";
import type { DatasetData, GoalForeignEntityRef } from "metabase-types/api";

type ResolveColumnValue = (column: string) => number | null;

export function useEntityColumnValues(
  data: DatasetData,
  entity: GoalForeignEntityRef | null,
  { enabled }: { enabled: boolean },
): ResolveColumnValue {
  const { currentData: goalValues } = useReferencedEntitiesQuery(
    enabled && entity != null ? [toReferencedEntity(entity)] : [],
  );

  const sourceData =
    entity != null && goalValues?.[entity.type]?.[entity.id]?.data != null
      ? { ...data, referenced_entities: goalValues }
      : data;

  return (column) => {
    if (entity == null) {
      return null;
    }

    return resolveGoalValue(sourceData, { ...entity, column }).value;
  };
}
