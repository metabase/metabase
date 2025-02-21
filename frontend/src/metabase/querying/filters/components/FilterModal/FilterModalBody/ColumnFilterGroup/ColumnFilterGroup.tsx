import { useMemo, useState } from "react";

import type { ColumnItem } from "metabase/querying/filters/types";
import { DelayGroup } from "metabase/ui";

import { useFilterModalContext } from "../../context";
import { ColumnFilterItem } from "../ColumnFilterItem";

import { findColumnFilters, findVisibleFilters } from "./utils";

export interface ColumnFilterGroupProps {
  columnItem: ColumnItem;
}

export function ColumnFilterGroup({ columnItem }: ColumnFilterGroupProps) {
  const { query } = useFilterModalContext();
  const { column, stageIndex } = columnItem;
  const currentFilters = useMemo(
    () => findColumnFilters(query, stageIndex, column),
    [query, stageIndex, column],
  );
  const [initialFilterCount] = useState(currentFilters.length);
  const visibleFilters = findVisibleFilters(currentFilters, initialFilterCount);

  return (
    <DelayGroup>
      {visibleFilters.map((filter, filterIndex) => (
        <ColumnFilterItem
          key={filterIndex}
          columnItem={columnItem}
          filter={filter}
        />
      ))}
    </DelayGroup>
  );
}
