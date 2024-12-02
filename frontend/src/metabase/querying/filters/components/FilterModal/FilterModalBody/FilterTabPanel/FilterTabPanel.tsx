import type { GroupItem } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

import { ColumnFilterList } from "../ColumnFilterList";
import { SegmentFilterItem } from "../SegmentFilterItem";

import { TabPanelRoot } from "./FilterTabPanel.styled";

export interface FilterTabPanelProps {
  query: Lib.Query;
  groupItem: GroupItem;
  isSearching: boolean;
  onChange: (newQuery: Lib.Query) => void;
  onInput: () => void;
}

export function FilterTabPanel({
  query,
  groupItem,
  isSearching,
  onChange,
  onInput,
}: FilterTabPanelProps) {
  return (
    <TabPanelRoot value={groupItem.key}>
      <ul>
        {groupItem.segmentItems.length > 0 && (
          <SegmentFilterItem
            query={query}
            segmentItems={groupItem.segmentItems}
            onChange={onChange}
          />
        )}
        {groupItem.columnItems.length > 0 && (
          <ColumnFilterList
            query={query}
            columnItems={groupItem.columnItems}
            isSearching={isSearching}
            onChange={onChange}
            onInput={onInput}
          />
        )}
      </ul>
    </TabPanelRoot>
  );
}
