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

/** The options of the column step: the columns of each table, in table order. */
export function useColumnSuggestions(
  query: Lib.Query,
  stageIndex: number,
  columnGroups: ColumnGroup[],
): ColumnSuggestions {
  return useMemo(() => {
    const items = new Map<string, ColumnPickerItem>();
    const columnOption = (key: string, column: DraftColumn) => {
      items.set(key, { type: "column", column });
      return {
        value: key,
        label: column.label,
        icon: getColumnIcon(column.column),
      };
    };

    const tableGroups = columnGroups.flatMap(
      (group, groupIndex): SuggestionGroup[] => {
        const segmentGroup: SuggestionGroup = {
          section: group.label,
          sectionIcon: group.icon,
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
        return [
          segmentGroup,
          {
            section: group.label,
            sectionIcon: group.icon,
            options: group.columns.map((column, columnIndex) =>
              columnOption(`column:${groupIndex}:${columnIndex}`, column),
            ),
          },
        ];
      },
    );

    return { groups: tableGroups, getItem: (key) => items.get(key) };
  }, [query, stageIndex, columnGroups]);
}
