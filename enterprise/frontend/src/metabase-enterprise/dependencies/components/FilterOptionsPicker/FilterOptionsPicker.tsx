import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Button,
  FixedSizeIcon,
  Popover,
  Stack,
} from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyFilterOptions } from "../../types";

import { LocationFilterPicker } from "./LocationFilterPicker";
import { TypeFilterPicker } from "./TypeFilterPicker";

type FilterOptionsPickerProps = {
  filterOptions: DependencyFilterOptions;
  availableGroupTypes?: DependencyGroupType[];
  compact?: boolean;
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

export function FilterOptionsPicker({
  filterOptions,
  availableGroupTypes = [],
  compact = false,
  onFilterOptionsChange,
}: FilterOptionsPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        {compact ? (
          <ActionIcon aria-label={t`Filter`} onClick={toggle}>
            <FixedSizeIcon c="text-primary" name="filter" />
          </ActionIcon>
        ) : (
          <Button
            leftSection={<FixedSizeIcon name="filter" aria-hidden />}
            data-testid="dependency-filter-button"
            onClick={toggle}
          >
            {t`Filter`}
          </Button>
        )}
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
  return (
    <Box w="20rem" p="md">
      <Stack>
        {availableGroupTypes.length > 0 && (
          <TypeFilterPicker
            filterOptions={filterOptions}
            availableGroupTypes={availableGroupTypes}
            onFilterOptionsChange={onFilterOptionsChange}
          />
        )}
        <LocationFilterPicker
          filterOptions={filterOptions}
          onFilterOptionsChange={onFilterOptionsChange}
        />
      </Stack>
    </Box>
  );
}
