import { useDisclosure } from "@mantine/hooks";

import { Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { FilterPicker } from "../../FilterPicker";
import { FilterPill } from "../FilterPill";

interface FilterPanelPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause;
  longDisplayName: Lib.ClauseDisplayInfo["longDisplayName"];
  handleChange: (filter: Lib.Filterable) => void;
  handleRemove: () => void;
}

export function FilterPanelPopover({
  query,
  stageIndex,
  filter,
  longDisplayName,
  handleChange,
  handleRemove,
}: FilterPanelPopoverProps) {
  const [isOpened, { open, close, toggle }] = useDisclosure();

  const onRemove = () => {
    handleRemove();
    close();
  };

  const onChange = (filter: Lib.Filterable) => {
    handleChange(filter);
    close();
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={toggle}
    >
      <Popover.Target>
        <FilterPill onClick={open} onRemoveClick={onRemove}>
          {longDisplayName}
        </FilterPill>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          onSelect={onChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
