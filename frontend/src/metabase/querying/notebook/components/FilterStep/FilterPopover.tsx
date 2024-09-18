import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import type * as Lib from "metabase-lib";

interface FilterPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  initialFilter?: Lib.FilterClause;
  initialColumn?: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  filterIndex?: number;
  onAddFilter: (filter: Lib.Filterable) => void;
  onUpdateFilter: (
    targetFilter: Lib.FilterClause,
    nextFilter: Lib.Filterable,
  ) => void;
  onClose?: () => void;
}

export function FilterPopover({
  query,
  stageIndex,
  filter,
  initialFilter,
  filterIndex,
  onAddFilter,
  onUpdateFilter,
  onClose,
  initialColumn,
}: FilterPopoverProps) {
  return (
    <FilterPicker
      initialColumn={initialColumn}
      query={query}
      stageIndex={stageIndex}
      isNew={Boolean(initialFilter)}
      filter={filter ?? initialFilter}
      filterIndex={filterIndex}
      onSelect={newFilter => {
        if (filter) {
          onUpdateFilter(filter, newFilter);
        } else {
          onAddFilter(newFilter);
        }
      }}
      onClose={onClose}
    />
  );
}
