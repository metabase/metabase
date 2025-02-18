import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import _ from "underscore";

import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterPicker } from "../../FilterPicker";
import { FilterPill } from "../FilterPill";

interface FilterPanelPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause;
  onChange: (query: Lib.Query) => void;

  dirtyAddedFilters: Filter[];
  dirtyRemovedFilters: Filter[];
  setDirtyAddedFilters: Dispatch<SetStateAction<Filter[]>>;
  setDirtyRemovedFilters: Dispatch<SetStateAction<Filter[]>>;
}

type Filter = {
  id: number;
  filter: Lib.Clause | Lib.SegmentMetadata;
  stageIndex: number;
};

export function FilterPanelPopover({
  query,
  stageIndex,
  filter,
  onChange,
  setDirtyAddedFilters,
  setDirtyRemovedFilters,
}: FilterPanelPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);

  const filterInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, filter),
    [query, stageIndex, filter],
  );

  const handleChange = (newFilter: Lib.Clause | Lib.SegmentMetadata) => {
    onChange(Lib.replaceClause(query, stageIndex, filter, newFilter));
    setIsOpened(false);
  };

  const handleRemove = () => {
    const isClauseInQuery = true; // TODO
    if (isClauseInQuery) {
      // onChange(Lib.removeClause(query, stageIndex, filter));
      setDirtyRemovedFilters(filters => {
        return [...filters, { stageIndex, filter }];
      });
    } else {
      setDirtyAddedFilters(filters =>
        filters.filter(entry => {
          //hack
          const a = Lib.displayInfo(query, entry.stageIndex, entry.filter);
          const b = Lib.displayInfo(query, stageIndex, filter);
          return !_.isEqual(a, b);
        }),
      );
    }
    setIsOpened(false);
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <FilterPill
          onClick={() => setIsOpened(isOpened => !isOpened)}
          onRemoveClick={handleRemove}
        >
          {filterInfo.longDisplayName}
        </FilterPill>
      </Popover.Target>
      <Popover.Dropdown data-testid="filter-picker-dropdown">
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
