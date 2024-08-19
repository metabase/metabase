import { t } from "ttag";

import {
  getColumnGroupIcon,
  getColumnGroupName,
} from "metabase/common/utils/column-groups";
import type { GroupItem } from "metabase/querying/components/FilterContent";
import * as Lib from "metabase-lib";
import { getFilterStageIndexes } from "metabase-lib/v1/parameters/utils/targets";

export function getGroupItems(query: Lib.Query): GroupItem[] {
  const stageIndexes = getFilterStageIndexes(query);
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
  const stageIndexes = getFilterStageIndexes(query);
  const filters = stageIndexes.flatMap(stageIndex =>
    Lib.filters(query, stageIndex),
  );
  return filters.length > 0;
}

export function removeFilters(query: Lib.Query) {
  const stageIndexes = getFilterStageIndexes(query);
  return stageIndexes.reduce(
    (newQuery, stageIndex) => Lib.removeFilters(newQuery, stageIndex),
    query,
  );
}
