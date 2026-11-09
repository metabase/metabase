import { isAggregationReference } from "metabase-lib/v1/references";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { Card, DatasetColumn, Field } from "metabase-types/api";

import type { ColumnOption } from "./types";

export function getCardGoalColumnOptions(card: Card): ColumnOption[] {
  const columns = card.result_metadata ?? [];
  // the BE removes a metric's breakouts before it runs the goal query
  const goalColumns =
    card.type === "metric"
      ? columns.filter((column) => isAggregationReference(column.field_ref))
      : columns;

  return getNumericColumnOptions(goalColumns);
}

export function getNumericColumnOptions(
  columns: DatasetColumn[] | Field[],
): ColumnOption[] {
  return columns.filter(isNumeric).map((column) => ({
    name: column.name,
    label: column.display_name || column.name,
  }));
}
