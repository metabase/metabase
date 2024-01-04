import { useMemo } from "react";
import * as Lib from "metabase-lib";
import { Popover } from "metabase/ui";
import { FilterPicker } from "metabase/querying";
import { FilterPill } from "../FilterPill";

interface FilterPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause;
  onChange: (query: Lib.Query) => void;
}

export function FilterPopover({
  query,
  stageIndex,
  filter,
  onChange,
}: FilterPopoverProps) {
  const filterInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, filter),
    [query, stageIndex, filter],
  );

  const handleChange = (newFilter: Lib.Clause | Lib.SegmentMetadata) => {
    onChange(Lib.replaceClause(query, stageIndex, filter, newFilter));
  };

  const handleRemove = () => {
    onChange(Lib.removeClause(query, stageIndex, filter));
  };

  return (
    <Popover>
      <Popover.Target>
        <FilterPill onRemoveClick={handleRemove}>
          {filterInfo.displayName}
        </FilterPill>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          onSelect={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
