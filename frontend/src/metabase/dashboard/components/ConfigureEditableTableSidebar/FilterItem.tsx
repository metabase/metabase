import { useMemo, useState } from "react";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

interface FilterPanelPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause;
  filterIndex: number;
  onChange: (query: Lib.Query) => void;
}

export function FilterItem({
  query,
  stageIndex,
  filter,
  filterIndex,
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
        <Button
          variant="filled"
          color="filter"
          rightSection={<Icon name="close" onClick={handleRemove} />}
          onClick={() => setIsOpened((isOpened) => !isOpened)}
        >
          {filterInfo.longDisplayName}
        </Button>
      </Popover.Target>
      <Popover.Dropdown data-testid="filter-picker-dropdown">
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={filterIndex}
          onSelect={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
