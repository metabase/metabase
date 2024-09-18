import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import * as Lib from "metabase-lib";

interface FilterPopoverProps {
  initialColumn?: Lib.ColumnMetadata;
  query: Lib.Query;
  stageIndex: number;
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
  initialColumn,
  query,
  stageIndex,
  filter,
  filterIndex,
  onAddFilter,
  onUpdateFilter,
  onClose,
}: FilterPopoverProps) {
  return (
    <FilterPicker
      initialColumn={initialColumn}
      query={query}
      stageIndex={stageIndex}
      filter={filter}
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
