import _ from "underscore";
import { getIn } from "icepick";

import { isPivotGroupColumn } from "metabase/lib/data_grid";

import type { Column } from "metabase-types/types/Dataset";
import type { Card } from "metabase-types/types/Card";
import type { Field } from "metabase-types/types/Field";

import { partitions } from "./partitions";

type PivotSetting = { columns: Field[]; rows: Field[]; values: Field[] };

export function updateValueWithCurrentColumns(
  storedValue: PivotSetting,
  columns: Column[],
) {
  const currentQueryFieldRefs = columns.map(c => JSON.stringify(c.field_ref));
  const currentSettingFieldRefs = Object.values(storedValue).flatMap(
    (fieldRefs: Field[]) =>
      fieldRefs.map((field_ref: Field) => JSON.stringify(field_ref)),
  );
  const toAdd = _.difference(currentQueryFieldRefs, currentSettingFieldRefs);
  const toRemove = _.difference(currentSettingFieldRefs, currentQueryFieldRefs);

  // remove toRemove
  const value = _.mapObject(storedValue, fieldRefs =>
    fieldRefs.filter(
      (field_ref: Field) => !toRemove.includes(JSON.stringify(field_ref)),
    ),
  ) ?? { columns: [], rows: [], values: [] };
  // add toAdd to first partitions where it matches the filter
  for (const fieldRef of toAdd) {
    for (const { columnFilter: filter, name } of partitions) {
      const column = columns.find(
        c => JSON.stringify(c.field_ref) === fieldRef,
      );
      if (filter == null || filter(column)) {
        value[name] = [...(value[name] as any[]), column?.field_ref];
        break;
      }
    }
  }
  return value;
}

// This is a hack. We need to pass pivot_rows and pivot_cols on each query.
// When a breakout is added to the query, we need to partition it before getting the rows.
// We pretend the breakouts are columns so we can partition the new breakout.
export function addMissingCardBreakouts(setting: PivotSetting, card: Card) {
  const breakouts = getIn(card, ["dataset_query", "query", "breakout"]) || [];
  if (breakouts.length <= setting.columns.length + setting.rows.length) {
    return setting;
  }
  const breakoutFieldRefs = breakouts.map((field_ref: any) => ({ field_ref }));
  const { columns, rows } = updateValueWithCurrentColumns(
    setting,
    breakoutFieldRefs,
  );
  return { ...setting, columns, rows };
}

export function isColumnValid(col: Column) {
  return (
    col.source === "aggregation" ||
    col.source === "breakout" ||
    isPivotGroupColumn(col)
  );
}

export function isFormattablePivotColumn(column: Column) {
  return column.source === "aggregation";
}
