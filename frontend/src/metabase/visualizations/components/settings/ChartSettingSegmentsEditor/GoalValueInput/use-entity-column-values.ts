import { useMemo } from "react";

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

  const entityData =
    entity != null
      ? freshDataset?.data?.referenced_entities?.[entity.type]?.[entity.id]
          ?.data
      : undefined;

  const values = useMemo(() => {
    const { cols = [], rows = [] } = entityData ?? {};
    const row = rows[0] ?? [];

    return new Map(
      cols.map((column, index) => {
        const raw = row[index];
        const value =
          typeof raw === "number" && Number.isFinite(raw) ? raw : null;

        return [column.name, value];
      }),
    );
  }, [entityData]);

  return (column) => {
    if (entityData != null) {
      return values.get(column) ?? null;
    }

    if (entity == null) {
      return null;
    }

    return resolveGoalValue(data, {
      type: entity.type,
      id: entity.id,
      column,
    }).value;
  };
}
