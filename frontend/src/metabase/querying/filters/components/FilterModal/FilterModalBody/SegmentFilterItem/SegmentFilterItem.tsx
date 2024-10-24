import type { SegmentItem } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

import { SegmentFilterEditor } from "../../SegmentFilterEditor";
import { FilterTabItem } from "../FilterTabItem";

import { addSegmentFilters, removeSegmentFilters } from "./utils";

export interface SegmentFilterItemProps {
  query: Lib.Query;
  segmentItems: SegmentItem[];
  onChange: (newQuery: Lib.Query) => void;
}

export function SegmentFilterItem({
  query,
  segmentItems,
  onChange,
}: SegmentFilterItemProps) {
  const handleChange = (newSegmentItems: SegmentItem[]) => {
    const newQuery = removeSegmentFilters(query, segmentItems);
    onChange(addSegmentFilters(newQuery, newSegmentItems));
  };

  return (
    <FilterTabItem
      component="li"
      px="2rem"
      py="1rem"
      data-testid="filter-column-segments"
    >
      <SegmentFilterEditor
        segmentItems={segmentItems}
        onChange={handleChange}
      />
    </FilterTabItem>
  );
}
