import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Checkbox,
  FixedSizeIcon,
  Popover,
  Stack,
} from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import type { FilterOption } from "../../types";
import { canFilterByOption } from "../../utils";

import { getFilterItems } from "./utils";

type FilterOptionsPickerProps = {
  groupType: DependencyGroupType;
  filterOptions: FilterOption[];
  onFilterOptionsChange: (filterOptions: FilterOption[]) => void;
};

export function FilterOptionsPicker({
  groupType,
  filterOptions,
  onFilterOptionsChange,
}: FilterOptionsPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <ActionIcon aria-label={t`Filter`} onClick={toggle}>
          <FixedSizeIcon c="text-primary" name="filter" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterOptionsPopover
          groupType={groupType}
          filterOptions={filterOptions}
          onFilterOptionsChange={onFilterOptionsChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type FilterOptionsPopoverProps = {
  groupType: DependencyGroupType;
  filterOptions: FilterOption[];
  onFilterOptionsChange: (filterOptions: FilterOption[]) => void;
};

function FilterOptionsPopover({
  groupType,
  filterOptions,
  onFilterOptionsChange,
}: FilterOptionsPopoverProps) {
  const filterItems = getFilterItems().filter((item) =>
    canFilterByOption(groupType, item.value),
  );

  const handleFilterOptionsChange = (filterOptions: string[]) => {
    onFilterOptionsChange(filterOptions as FilterOption[]);
  };

  return (
    <Box w="15rem" p="md">
      <Checkbox.Group
        value={filterOptions}
        onChange={handleFilterOptionsChange}
      >
        <Stack gap="0.75rem">
          {filterItems.map((item) => (
            <Checkbox key={item.value} value={item.value} label={item.label} />
          ))}
        </Stack>
      </Checkbox.Group>
    </Box>
  );
}
