import { useDisclosure } from "@mantine/hooks";
import { memo } from "react";
import { t } from "ttag";

import { Box, Button, FixedSizeIcon, Popover, Stack } from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyListFilterOptions } from "../../types";

import { TypeFilterPicker } from "./TypeFilterPicker";

type DependencyListFilterPickerProps = {
  filterOptions: DependencyListFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  onFilterOptionsChange: (filterOptions: DependencyListFilterOptions) => void;
};

export const DependencyListFilterPicker = memo(function ListFilterPicker({
  filterOptions,
  availableGroupTypes,
  onFilterOptionsChange,
}: DependencyListFilterPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <Button
          leftSection={<FixedSizeIcon name="filter" aria-hidden />}
          onClick={toggle}
        >
          {t`Filter`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <ListFilterPopover
          filterOptions={filterOptions}
          availableGroupTypes={availableGroupTypes}
          onFilterOptionsChange={onFilterOptionsChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
});

type ListFilterPopoverProps = {
  filterOptions: DependencyListFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  onFilterOptionsChange: (filterOptions: DependencyListFilterOptions) => void;
};

function ListFilterPopover({
  filterOptions,
  availableGroupTypes,
  onFilterOptionsChange,
}: ListFilterPopoverProps) {
  const handleTypesChange = (groupTypes: DependencyGroupType[]) => {
    onFilterOptionsChange({ ...filterOptions, groupTypes });
  };

  return (
    <Box w="20rem" p="md">
      <Stack>
        <TypeFilterPicker
          groupTypes={filterOptions.groupTypes}
          availableGroupTypes={availableGroupTypes}
          onChange={handleTypesChange}
        />
      </Stack>
    </Box>
  );
}
