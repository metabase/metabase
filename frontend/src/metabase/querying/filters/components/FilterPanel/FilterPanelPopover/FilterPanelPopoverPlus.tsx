import { type Dispatch, type SetStateAction, useState } from "react";

import { Icon, Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { FilterPicker2 } from "../../FilterPicker2";
import { FilterPill } from "../FilterPill";

let ID = 1000000;

interface FilterPanelPopoverProps {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;

  dirtyAddedFilters: Filter[];
  dirtyRemovedFilters: Filter[];
  setDirtyAddedFilters: Dispatch<SetStateAction<Filter[]>>;
  setDirtyRemovedFilters: Dispatch<SetStateAction<Filter[]>>;
}

type Filter = {
  filter: Lib.Clause | Lib.SegmentMetadata;
  stageIndex: number;
};

export function FilterPanelPopoverPlus({
  query,
  setDirtyAddedFilters,
  // setDirtyRemovedFilters,
}: FilterPanelPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);

  const handleAddFilter = (filter: Filter, stageIndex: number) => {
    const item = {
      stageIndex,
      filter,
      id: ID++,
    };
    setDirtyAddedFilters(filters => [...filters, item]);
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
          px={6}
          w={24}
          onClick={() => setIsOpened(isOpened => !isOpened)}
        >
          <Icon name="add2" size={12} />
        </FilterPill>
      </Popover.Target>
      <Popover.Dropdown data-testid="filter-picker-dropdown">
        <FilterPicker2
          query={query}
          filter={undefined}
          withCustomExpression={false}
          onSelect={handleAddFilter}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
