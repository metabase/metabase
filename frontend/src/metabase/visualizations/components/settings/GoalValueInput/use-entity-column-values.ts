import { useReferencedEntitiesQuery } from "metabase/visualizations/hooks/use-referenced-entities-query";
import {
  type GoalValueResult,
  resolveGoalValue,
  toReferencedEntity,
} from "metabase/viz-core";
import type {
  DatasetData,
  DatasetQuery,
  GoalForeignEntityRef,
} from "metabase-types/api";

type ResolveColumnValue = (column: string) => GoalValueResult;

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
      return { value: null };
    }

    return resolveGoalValue(sourceData, { ...entity, column });
  };
}
