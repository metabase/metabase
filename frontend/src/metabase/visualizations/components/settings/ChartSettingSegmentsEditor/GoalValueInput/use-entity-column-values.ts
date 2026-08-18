import { useMemo } from "react";

import { skipToken, useGetCardQueryQuery } from "metabase/api";
import { resolveGoalValue } from "metabase/visualizations/lib/dynamic-goals";
import type { DatasetData } from "metabase-types/api";

import type { GoalEntityRef } from "./types";

/**
 * Resolves the referenced entity's column values for the column list.
 * `data`'s referenced_entities only carries already-referenced columns, so a
 * fresh run of the entity's query previews the values of all of them.
 */
export function useEntityColumnValues(
  data: DatasetData,
  entity: GoalEntityRef | null,
  { enabled }: { enabled: boolean },
): (columnName: string) => number | null {
  const { data: entityDataset } = useGetCardQueryQuery(
    enabled && entity?.type === "card" ? { cardId: entity.id } : skipToken,
  );

  const values = useMemo(() => {
    const { cols = [], rows = [] } = entityDataset?.data ?? {};
    const row = rows[0] ?? [];
    return new Map(
      cols.map((column, index): [string, number | null] => {
        const raw = row[index];
        return [
          column.name,
          typeof raw === "number" && Number.isFinite(raw) ? raw : null,
        ];
      }),
    );
  }, [entityDataset]);

  return (columnName) =>
    values.get(columnName) ??
    (entity != null
      ? resolveGoalValue(data, {
          type: entity.type,
          id: entity.id,
          column: columnName,
        }).value
      : null);
}
