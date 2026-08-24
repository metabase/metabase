import { useMemo } from "react";

import { skipToken, useGetCardQuery, useGetMeasureQuery } from "metabase/api";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { GoalEntityRef } from "metabase-types/api";

import type { ColumnOption, ReferencedEntityInfo } from "./types";

export function useReferencedEntity(
  entity: GoalEntityRef | null,
): ReferencedEntityInfo {
  const { data: card, isError: isCardError } = useGetCardQuery(
    entity?.type === "card" ? { id: entity.id } : skipToken,
  );
  const { data: measure, isError: isMeasureError } = useGetMeasureQuery(
    entity?.type === "measure" ? entity.id : skipToken,
  );

  const hasError =
    entity != null && (entity.type === "card" ? isCardError : isMeasureError);
  const isLoading =
    entity != null &&
    !hasError &&
    (entity.type === "card" ? card == null : measure == null);
  const name = entity?.type === "card" ? card?.name : measure?.name;

  const columns: ColumnOption[] = useMemo(() => {
    if (entity?.type === "card") {
      return (card?.result_metadata ?? []).filter(isNumeric).map((field) => ({
        name: field.name,
        label: field.display_name || field.name,
      }));
    }

    if (measure?.result_column_name) {
      return [{ name: measure.result_column_name, label: measure.name }];
    }

    return [];
  }, [entity?.type, card, measure]);

  return { name, columns, isLoading, hasError };
}
