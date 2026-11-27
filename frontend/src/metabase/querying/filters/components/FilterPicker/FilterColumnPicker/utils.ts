import { getGroupName } from "metabase/querying/filters/utils/groups";
import * as Lib from "metabase-lib";

import type { ColumnListItem, SegmentListItem } from "../types";

export type FilterColumnGroup = {
  name: string;
  groupInfo: Lib.ColumnGroupDisplayInfo;
  stageIndex: number;
  segmentItems: SegmentListItem[];
  columnItems: ColumnListItem[];
};

const getColumnItems = (
  query: Lib.Query,
  stageIndex: number,
  group: Lib.ColumnGroup,
) =>
  Lib.getColumnsFromColumnGroup(group).map((column) => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    return {
      name: columnInfo.name,
      displayName: columnInfo.displayName,
      filterPositions: columnInfo.filterPositions,
      column,
      query,
      stageIndex,
      combinedName: `${columnInfo.table?.name ?? ""} ${columnInfo.name}`,
      combinedDisplayName: `${columnInfo.table?.displayName ?? ""} ${columnInfo.displayName}`,
      longDisplayName: columnInfo.longDisplayName,
    };
  });

const getSegmentItems = (
  query: Lib.Query,
  stageIndex: number,
  groupInfo: Lib.ColumnGroupDisplayInfo,
) =>
  groupInfo.isSourceTable
    ? Lib.availableSegments(query, stageIndex).map((segment) => ({
        ...Lib.displayInfo(query, stageIndex, segment),
        segment,
        stageIndex,
      }))
    : [];

export const getFilterColumnGroups = (
  query: Lib.Query,
  stageIndexes: number[],
): FilterColumnGroup[] =>
  stageIndexes.flatMap((stageIndex) =>
    Lib.groupColumns(Lib.filterableColumns(query, stageIndex)).map((group) => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);
      return {
        name:
          stageIndexes.length > 1
            ? getGroupName(groupInfo, stageIndex)
            : groupInfo.displayName,
        groupInfo,
        stageIndex,
        segmentItems: getSegmentItems(query, stageIndex, groupInfo),
        columnItems: getColumnItems(query, stageIndex, group),
      };
    }),
  );
