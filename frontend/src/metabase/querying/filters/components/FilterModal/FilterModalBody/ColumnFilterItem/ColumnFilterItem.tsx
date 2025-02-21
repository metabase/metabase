import type { ColumnItem } from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";

import { ColumnFilterSection } from "../../ColumnFilterSection";
import { useFilterModalContext } from "../../context";
import { FilterTabItem } from "../FilterTabItem";

export interface ColumnFilterItemProps {
  columnItem: ColumnItem;
  filter: Lib.FilterClause | undefined;
}

export function ColumnFilterItem({
  columnItem,
  filter,
}: ColumnFilterItemProps) {
  const { query, onQueryChange } = useFilterModalContext();
  const { column, displayName, stageIndex } = columnItem;

  const handleChange = (newFilter: Lib.ExpressionClause | undefined) => {
    if (filter && newFilter) {
      onQueryChange(Lib.replaceClause(query, stageIndex, filter, newFilter));
    } else if (newFilter) {
      onQueryChange(Lib.filter(query, stageIndex, newFilter));
    } else if (filter) {
      onQueryChange(Lib.removeClause(query, stageIndex, filter));
    }
  };

  return (
    <FilterTabItem component="li" data-testid={`filter-column-${displayName}`}>
      <ColumnFilterSection
        stageIndex={stageIndex}
        column={column}
        filter={filter}
        onChange={handleChange}
      />
    </FilterTabItem>
  );
}
