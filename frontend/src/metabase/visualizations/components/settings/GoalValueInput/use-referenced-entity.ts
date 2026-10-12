import { useMemo } from "react";

import { skipToken, useGetCardQuery, useGetMeasureQuery } from "metabase/api";
import * as Urls from "metabase/urls";
import type { GoalForeignEntityRef } from "metabase-types/api";

import type {
  ColumnOption,
  ReferencedEntityInfo,
  ReferencedEntityKind,
} from "./types";
import { getNumericColumnOptions } from "./utils";

export function useReferencedEntity(
  entity: GoalForeignEntityRef | null,
): ReferencedEntityInfo {
  const { data: card, isError: isCardError } = useGetCardQuery(
    entity?.type === "card" ? { id: entity.id, ignore_error: true } : skipToken,
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
  const kind: ReferencedEntityKind | undefined =
    entity?.type === "card" ? card?.type : entity?.type;
  const name = entity?.type === "card" ? card?.name : measure?.name;
  const url =
    entity?.type === "card"
      ? card && Urls.card(card)
      : measure && Urls.exploreMeasure(measure.id);

  const columns: ColumnOption[] = useMemo(() => {
    if (entity?.type === "card") {
      return getNumericColumnOptions(card?.result_metadata ?? []);
    }

    if (measure?.result_column_name) {
      return [{ name: measure.result_column_name, label: measure.name }];
    }

    return [];
  }, [entity?.type, card, measure]);

  return { kind, name, url, columns, isLoading, hasError };
}
