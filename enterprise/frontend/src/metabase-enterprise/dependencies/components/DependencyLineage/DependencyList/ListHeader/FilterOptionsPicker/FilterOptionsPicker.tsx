import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  Checkbox,
  Icon,
  Popover,
  Stack,
  Tooltip,
} from "metabase/ui";

import type { FilterOption } from "../../types";

import { getFilterGroups } from "./utils";

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
  const filterGroups = getFilterGroups();

  const handleFilterOptionsChange = (filterOptions: string[]) => {
    onFilterOptionsChange(filterOptions as FilterOption[]);
  };

  return (
    <Stack w="15rem" p="md" gap="lg">
      {filterGroups.map((group, groupIndex) => (
        <Checkbox.Group
          key={groupIndex}
          value={filterOptions}
          label={group.label}
          onChange={handleFilterOptionsChange}
        >
          <Stack mt="sm" gap="sm">
            {group.items.map((item) => (
              <Checkbox
                key={item.value}
                value={item.value}
                label={item.label}
              />
            ))}
          </Stack>
        </Checkbox.Group>
      ))}
    </Stack>
  );
}
