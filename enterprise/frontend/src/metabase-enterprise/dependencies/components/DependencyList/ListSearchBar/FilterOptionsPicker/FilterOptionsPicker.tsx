import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Box, Button, FixedSizeIcon, Popover, Stack } from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyFilterOptions } from "../../../../types";

import { TypeFilterPicker } from "./TypeFilterPicker";

type FilterOptionsPickerProps = {
  filterOptions: DependencyFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

export function FilterOptionsPicker({
  filterOptions,
  availableGroupTypes,
  onFilterOptionsChange,
}: FilterOptionsPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <Button
          leftSection={<FixedSizeIcon name="filter" aria-hidden />}
          data-testid="dependency-list-filter-button"
          onClick={toggle}
        >
          {t`Filter`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterOptionsPopover
          filterOptions={filterOptions}
          availableGroupTypes={availableGroupTypes}
          onFilterOptionsChange={onFilterOptionsChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type FilterOptionsPopoverProps = {
  filterOptions: DependencyFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

function FilterOptionsPopover({
  filterOptions,
  availableGroupTypes,
  onFilterOptionsChange,
}: FilterOptionsPopoverProps) {
  const handleTypesChange = (groupTypes: DependencyGroupType[]) => {
    onFilterOptionsChange({ ...filterOptions, groupTypes });
  };

  return (
    <Box w="20rem" p="md">
      <Stack>
        <TypeFilterPicker
          groupTypes={filterOptions.groupTypes ?? []}
          availableGroupTypes={availableGroupTypes}
          onChange={handleTypesChange}
        />
      </Stack>
    </Box>
  );
}
