import { t } from "ttag";

import {
  getColumnGroupIcon,
  getColumnGroupName,
} from "metabase/common/utils/column-groups";
import type { GroupItem } from "metabase/querying/components/FilterContent";
import * as Lib from "metabase-lib";

export function appendStageIfAggregated(query: Lib.Query) {
  const aggregations = Lib.aggregations(query, -1);
  const breakouts = Lib.breakouts(query, -1);

  return aggregations.length > 0 && breakouts.length > 0
    ? Lib.appendStage(query)
    : query;
}

function getStageIndexes(query: Lib.Query) {
  const stageCount = Lib.stageCount(query);
  return stageCount > 1 ? [-2, -1] : [-1];
}

export function getGroupItems(query: Lib.Query): GroupItem[] {
  const stageIndexes = getStageIndexes(query);
  return stageIndexes.flatMap(stageIndex => {
    const columns = Lib.filterableColumns(query, stageIndex);
    const groups = Lib.groupColumns(columns);
    const segments = Lib.availableSegments(query, stageIndex);

    return groups.map((group, groupIndex) => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);
      const availableColumns = Lib.getColumnsFromColumnGroup(group);
      const availableSegments = groupIndex === 0 ? segments : [];

      return {
        key: `${stageIndex}-${groupIndex}`,
        displayName: getColumnGroupName(groupInfo) || t`Summaries`,
        icon: getColumnGroupIcon(groupInfo) || "sum",
        columnItems: availableColumns.map(column => {
          const columnInfo = Lib.displayInfo(query, stageIndex, column);
          return {
            column,
            displayName: columnInfo.displayName,
            stageIndex,
          };
        }),
        segmentItems: availableSegments.map(segment => {
          const segmentInfo = Lib.displayInfo(query, stageIndex, segment);
          return {
            segment,
            displayName: segmentInfo.displayName,
            stageIndex,
            filterPositions: segmentInfo.filterPositions ?? [],
          };
        }),
      };
    });
  });
}

export function hasFilters(query: Lib.Query) {
  const stageIndexes = getStageIndexes(query);
  const filters = stageIndexes.flatMap(stageIndex =>
    Lib.filters(query, stageIndex),
  );
  return filters.length > 0;
}

export function removeFilters(query: Lib.Query) {
  const stageIndexes = getStageIndexes(query);
  return stageIndexes.reduce(
    (newQuery, stageIndex) => Lib.removeFilters(newQuery, stageIndex),
    query,
  );
}
