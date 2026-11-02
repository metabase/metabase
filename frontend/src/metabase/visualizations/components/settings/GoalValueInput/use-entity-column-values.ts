import { useReferencedEntitiesQuery } from "metabase/visualizations/hooks/use-referenced-entities-query";
import { resolveGoalValue, toReferencedEntity } from "metabase/viz-core";
import type {
  DatasetData,
  DatasetQuery,
  GoalForeignEntityRef,
} from "metabase-types/api";

type EntityColumnValues = {
  hasTooManyRows: boolean;
  resolveColumnValue: (column: string) => number | null;
};

export function useEntityColumnValues(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  entity: GoalForeignEntityRef | null,
  { enabled }: { enabled: boolean },
): EntityColumnValues {
  const { currentData: freshDataset } = useReferencedEntitiesQuery(
    datasetQuery,
    enabled && entity != null ? [toReferencedEntity(entity)] : [],
  );

  const freshData = freshDataset?.data;
  const sourceData =
    entity != null &&
    freshData?.referenced_entities?.[entity.type]?.[entity.id] != null
      ? freshData
      : data;
  const hasTooManyRows =
    entity != null &&
    sourceData.referenced_entities?.[entity.type]?.[entity.id]?.error_type ===
      "too-many-rows";

  function resolveColumnValue(column: string) {
    if (entity == null) {
      return null;
    }

    return resolveGoalValue(sourceData, { ...entity, column }).value;
  }

  return { hasTooManyRows, resolveColumnValue };
}
