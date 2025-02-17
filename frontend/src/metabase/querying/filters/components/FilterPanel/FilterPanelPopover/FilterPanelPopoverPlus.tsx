import { type Dispatch, type SetStateAction, useState } from "react";

import { Icon, Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { FilterPicker } from "../../FilterPicker";
import { FilterPill } from "../FilterPill";

interface FilterPanelPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;

  dirtyAddedFilters: Filter[];
  dirtyRemovedFilters: Filter[];
  setDirtyAddedFilters: Dispatch<SetStateAction<Filter[]>>;
  setDirtyRemovedFilters: Dispatch<SetStateAction<Filter[]>>;
}

type Filter = Lib.Clause | Lib.SegmentMetadata;

export function FilterPanelPopoverPlus({
  query,
  stageIndex,
  setDirtyAddedFilters,
  // setDirtyRemovedFilters,
}: FilterPanelPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);

  const handleAddFilter = (filter: Filter) => {
    setDirtyAddedFilters(filters => [...filters, filter]);
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
          h={24}
          w={24}
          p={6}
          onClick={() => setIsOpened(isOpened => !isOpened)}
        >
          <Icon name="add2" size={12} />
        </FilterPill>
      </Popover.Target>
      <Popover.Dropdown data-testid="filter-picker-dropdown">
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={undefined}
          onSelect={handleAddFilter}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
