import type { GroupItem } from "metabase/querying/filters/types";

import { ColumnFilterList } from "../ColumnFilterList";
import { SegmentFilterItem } from "../SegmentFilterItem";

import { TabPanelRoot } from "./FilterTabPanel.styled";

export interface FilterTabPanelProps {
  groupItem: GroupItem;
}

export function FilterTabPanel({ groupItem }: FilterTabPanelProps) {
  return (
    <TabPanelRoot value={groupItem.key}>
      <ul>
        {groupItem.segmentItems.length > 0 && (
          <SegmentFilterItem segmentItems={groupItem.segmentItems} />
        )}
        {groupItem.columnItems.length > 0 && (
          <ColumnFilterList columnItems={groupItem.columnItems} />
        )}
      </ul>
    </TabPanelRoot>
  );
}
