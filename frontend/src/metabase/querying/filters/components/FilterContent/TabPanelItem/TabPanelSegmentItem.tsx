import type * as Lib from "metabase-lib";

import { SegmentFilterEditor } from "../SegmentFilterEditor";
import type { SegmentItem } from "../types";

import { TabPanelItem } from "./TabPanelItem.styled";
import { addSegmentFilters, removeSegmentFilters } from "./segments";

export interface TabPanelSegmentItemProps {
  query: Lib.Query;
  segmentItems: SegmentItem[];
  onChange: (newQuery: Lib.Query) => void;
}

export function TabPanelSegmentItem({
  query,
  segmentItems,
  onChange,
}: TabPanelSegmentItemProps) {
  const handleChange = (newSegmentItems: SegmentItem[]) => {
    const newQuery = removeSegmentFilters(query, segmentItems);
    onChange(addSegmentFilters(newQuery, newSegmentItems));
  };

  return (
    <TabPanelItem
      component="li"
      px="2rem"
      py="1rem"
      data-testid="filter-column-segments"
    >
      <SegmentFilterEditor
        segmentItems={segmentItems}
        onChange={handleChange}
      />
    </TabPanelItem>
  );
}
