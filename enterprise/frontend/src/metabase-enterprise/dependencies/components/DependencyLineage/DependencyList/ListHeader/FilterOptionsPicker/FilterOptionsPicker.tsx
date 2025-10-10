import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Checkbox,
  Icon,
  Popover,
  Stack,
  Tooltip,
} from "metabase/ui";

import type { FilterOption } from "../../types";

import { getFilterItems } from "./utils";

type FilterOptionsPickerProps = {
  filterOptions: FilterOption[];
  onFilterOptionsChange: (filterOptions: FilterOption[]) => void;
};

export function FilterOptionsPicker({
  filterOptions,
  onFilterOptionsChange,
}: FilterOptionsPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <Tooltip label={t`Filter`}>
          <ActionIcon onClick={toggle}>
            <Icon c="text-primary" name="filter" />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterOptionsPopover
          filterOptions={filterOptions}
          onFilterOptionsChange={onFilterOptionsChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type FilterOptionsPopoverProps = {
  filterOptions: FilterOption[];
  onFilterOptionsChange: (filterOptions: FilterOption[]) => void;
};

function FilterOptionsPopover({
  filterOptions,
  onFilterOptionsChange,
}: FilterOptionsPopoverProps) {
  const filterItems = getFilterItems();

  const handleFilterOptionsChange = (filterOptions: string[]) => {
    onFilterOptionsChange(filterOptions as FilterOption[]);
  };

  return (
    <Box w="15rem" p="md">
      <Checkbox.Group
        value={filterOptions}
        onChange={handleFilterOptionsChange}
      >
        <Stack mt="sm" gap="sm">
          {filterItems.map((item) => (
            <Checkbox key={item.value} value={item.value} label={item.label} />
          ))}
        </Stack>
      </Checkbox.Group>
    </Box>
  );
}
