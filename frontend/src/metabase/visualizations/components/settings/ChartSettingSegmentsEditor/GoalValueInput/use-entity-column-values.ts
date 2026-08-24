import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import {
  resolveGoalValue,
  toReferencedEntity,
} from "metabase/visualizations/lib/dynamic-goals";
import type {
  DatasetData,
  DatasetQuery,
  GoalEntityRef,
} from "metabase-types/api";

type ResolveColumnValue = (column: string) => number | null;

export function useEntityColumnValues(
  datasetQuery: DatasetQuery | undefined,
  data: DatasetData,
  entity: GoalEntityRef | null,
  { enabled }: { enabled: boolean },
): ResolveColumnValue {
  const { data: freshDataset } = useGetAdhocQueryQuery(
    enabled && entity != null && datasetQuery != null
      ? {
          ...datasetQuery,
          referenced_entities: [toReferencedEntity(entity)],
          ignore_error: true,
        }
      : skipToken,
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
