import { useMemo } from "react";

import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";

import type { DraftColumn, SuggestionGroup } from "./types";
import type { ColumnGroup } from "./utils";

export type ColumnPickerItem =
  | { type: "column"; column: DraftColumn }
  | { type: "segment"; segment: Lib.SegmentMetadata };

interface ColumnSuggestions {
  groups: SuggestionGroup[];
  getItem: (key: string) => ColumnPickerItem | undefined;
}

/**
 * Prototype: the options of the column step, with the segments and then the
 * columns of each table from A to Z.
 */
export function useColumnSuggestions(
  query: Lib.Query,
  stageIndex: number,
  columnGroups: ColumnGroup[],
): ColumnSuggestions {
  return useMemo(() => {
    const items = new Map<string, ColumnPickerItem>();

    const groups = columnGroups.flatMap(
      (group, groupIndex): SuggestionGroup[] => {
        const segmentGroup: SuggestionGroup = {
          section: group.label,
          options: group.segments.map((segment, segmentIndex) => {
            const key = `segment:${groupIndex}:${segmentIndex}`;
            items.set(key, { type: "segment", segment });
            return {
              value: key,
              label: Lib.displayInfo(query, stageIndex, segment).displayName,
              icon: "segment" as const,
            };
          }),
        };
        const columnGroup: SuggestionGroup = {
          section: group.label,
          options: group.columns
            .map((column, columnIndex) => ({
              key: `column:${groupIndex}:${columnIndex}`,
              column,
            }))
            .sort((a, b) => a.column.label.localeCompare(b.column.label))
            .map(({ key, column }) => {
              items.set(key, { type: "column", column });
              return {
                value: key,
                label: column.label,
                icon: getColumnIcon(column.column),
              };
            }),
        };
        return [segmentGroup, columnGroup];
      },
    );

    return { groups, getItem: (key) => items.get(key) };
  }, [query, stageIndex, columnGroups]);
}
