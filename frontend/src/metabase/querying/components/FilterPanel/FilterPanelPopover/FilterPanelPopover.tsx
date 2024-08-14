import { useMemo, useState } from "react";

import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterPicker } from "../../FilterPicker";
import { FilterPill } from "../FilterPill";

interface FilterPanelPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause;
  onChange: (query: Lib.Query) => void;
}

export function FilterPanelPopover({
  query,
  stageIndex,
  filter,
  onChange,
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
    onChange(Lib.removeClause(query, stageIndex, filter));
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
