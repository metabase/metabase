import { useReferencedEntitiesQuery } from "metabase/visualizations/hooks/use-referenced-entities-query";
import {
  resolveGoalValue,
  toReferencedEntity,
} from "metabase/visualizations/lib/dynamic-goals";
import type {
  DatasetData,
  DatasetQuery,
  GoalForeignEntityRef,
} from "metabase-types/api";

type ResolveColumnValue = (column: string) => number | null;

export function useEntityColumnValues(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  entity: GoalForeignEntityRef | null,
  { enabled }: { enabled: boolean },
): ResolveColumnValue {
  const { currentData: freshDataset } = useReferencedEntitiesQuery(
    datasetQuery,
    enabled && entity != null ? [toReferencedEntity(entity)] : [],
  );

  const freshData = freshDataset?.data;
  const sourceData =
    entity != null &&
    freshData?.referenced_entities?.[entity.type]?.[entity.id]?.data != null
      ? freshData
      : data;

  return (column) => {
    if (entity == null) {
      return null;
    }

    return resolveGoalValue(sourceData, { ...entity, column }).value;
  };
}
