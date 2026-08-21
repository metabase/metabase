import { useMemo } from "react";

import { skipToken, useGetCardQueryQuery } from "metabase/api";
import { resolveGoalValue } from "metabase/visualizations/lib/dynamic-goals";
import type { DatasetData } from "metabase-types/api";

import type { GoalEntityRef } from "./types";

type ResolveColumnValue = (column: string) => number | null;

export function useEntityColumnValues(
  data: DatasetData,
  entity: GoalEntityRef | null,
  { enabled }: { enabled: boolean },
): ResolveColumnValue {
  const { data: entityDataset } = useGetCardQueryQuery(
    enabled && entity?.type === "card" ? { cardId: entity.id } : skipToken,
  );

  const values = useMemo(() => {
    const { cols = [], rows = [] } = entityDataset?.data ?? {};
    const row = rows[0] ?? [];

    return new Map(
      cols.map((column, index) => {
        const raw = row[index];
        const value =
          typeof raw === "number" && Number.isFinite(raw) ? raw : null;

        return [column.name, value];
      }),
    );
  }, [entityDataset]);

  return (column) => {
    const value = values.get(column);

    if (value != null) {
      return value;
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
