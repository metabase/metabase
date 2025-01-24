import { useMemo, useState } from "react";

import type { ColumnItem } from "metabase/querying/filters/types";
import { DelayGroup } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { ColumnFilterItem } from "../ColumnFilterItem";

import { findColumnFilters, findVisibleFilters } from "./utils";

export interface ColumnFilterGroupProps {
  query: Lib.Query;
  columnItem: ColumnItem;
  onChange: (newQuery: Lib.Query) => void;
  onInput: () => void;
}

export function ColumnFilterGroup({
  query,
  columnItem,
  onChange,
  onInput,
}: ColumnFilterGroupProps) {
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
          query={query}
          columnItem={columnItem}
          filter={filter}
          onChange={onChange}
          onInput={onInput}
        />
      ))}
    </DelayGroup>
  );
}
