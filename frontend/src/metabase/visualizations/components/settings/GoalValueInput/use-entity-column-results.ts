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

type EntityColumnResults = {
  resolveColumn: (column: string) => GoalValueResult;
  hasParameters: boolean;
};

export function useEntityColumnResults(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  entity: GoalForeignEntityRef | null,
  { enabled }: { enabled: boolean },
): EntityColumnResults {
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
  const entityResult =
    entity && sourceData.referenced_entities?.[entity.type]?.[entity.id];

  return {
    hasParameters: entityResult?.error_type === "has-parameters",
    resolveColumn: (column) =>
      entity
        ? resolveGoalValue(sourceData, { ...entity, column })
        : { value: null },
  };
}
