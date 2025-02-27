import type { SegmentItem } from "metabase/querying/filters/types";

import { SegmentFilterEditor } from "../../SegmentFilterEditor";
import { useFilterModalContext } from "../../context";
import { FilterTabItem } from "../FilterTabItem";

import { addSegmentFilters, removeSegmentFilters } from "./utils";

export interface SegmentFilterItemProps {
  segmentItems: SegmentItem[];
}

export function SegmentFilterItem({ segmentItems }: SegmentFilterItemProps) {
  const { query, onQueryChange } = useFilterModalContext();

  const handleChange = (newSegmentItems: SegmentItem[]) => {
    const newQuery = removeSegmentFilters(query, segmentItems);
    onQueryChange(addSegmentFilters(newQuery, newSegmentItems));
  };

  return (
    <FilterTabItem component="li" data-testid="filter-column-segments">
      <SegmentFilterEditor
        segmentItems={segmentItems}
        onChange={handleChange}
      />
    </FilterTabItem>
  );
}
