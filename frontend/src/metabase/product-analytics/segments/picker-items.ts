import type { CustomListItem } from "metabase/querying/filters/components/FilterPicker/types";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import type { PaletteSegment } from "./types";

/** A palette segment as an entry in the shared column picker, keyed by the segment's key. */
export const toSegmentPickerItem = (
  segment: PaletteSegment,
): CustomListItem => ({
  type: "custom",
  key: segment.key,
  name: segment.name,
  displayName: segment.name,
  icon: "segment",
});

/** Whether a column group is the linked users table, read from its columns' fields. */
export const isTableColumnGroup = (
  query: Lib.Query,
  columns: Lib.ColumnMetadata[],
  table: Table,
): boolean => {
  const fieldIds = new Set((table.fields ?? []).map((field) => field.id));
  return columns.some((column) => {
    const { fieldId } = Lib.fieldValuesSearchInfo(query, column);
    return fieldId !== null && fieldIds.has(fieldId);
  });
};
