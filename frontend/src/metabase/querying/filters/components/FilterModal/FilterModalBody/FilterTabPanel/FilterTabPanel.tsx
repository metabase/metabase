import type { GroupItem } from "metabase/querying/filters/types";
import { Tabs } from "metabase/ui";

import { ColumnFilterList } from "../ColumnFilterList";
import { SegmentFilterItem } from "../SegmentFilterItem";

import S from "./FilterTabPanel.module.css";

export interface FilterTabPanelProps {
  groupItem: GroupItem;
}

export function FilterTabPanel({ groupItem }: FilterTabPanelProps) {
  return (
    <Tabs.Panel className={S.TabPanelRoot} value={groupItem.key}>
      <ul>
        {groupItem.segmentItems.length > 0 && (
          <SegmentFilterItem segmentItems={groupItem.segmentItems} />
        )}
        {groupItem.columnItems.length > 0 && (
          <ColumnFilterList columnItems={groupItem.columnItems} />
        )}
      </ul>
    </Tabs.Panel>
  );
}
