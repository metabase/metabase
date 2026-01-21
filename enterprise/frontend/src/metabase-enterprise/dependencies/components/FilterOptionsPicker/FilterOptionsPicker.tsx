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
import type {
  CardType,
  DependencyFilterOptions,
  DependencyType,
} from "metabase-types/api";

import { LocationFilterPicker } from "./LocationFilterPicker";
import { TypeFilterPicker } from "./TypeFilterPicker";

type FilterOptionsPickerProps = {
  filters: DependencyFilterOptions;
  availableTypes: DependencyType[];
  availableCardTypes: CardType[];
  compact?: boolean;
  onFiltersChange: (filters: DependencyFilterOptions) => void;
};

export function FilterOptionsPicker({
  filters,
  availableTypes,
  availableCardTypes,
  compact = false,
  onFiltersChange,
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
            data-testid="dependency-list-filter-button"
            onClick={toggle}
          >
            {t`Filter`}
          </Button>
        )}
      </Popover.Target>
      <Popover.Dropdown>
        <FilterOptionsPopover
          filters={filters}
          availableTypes={availableTypes}
          availableCardTypes={availableCardTypes}
          onFiltersChange={onFiltersChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type FilterOptionsPopoverProps = {
  filters: DependencyFilterOptions;
  availableTypes: DependencyType[];
  availableCardTypes: CardType[];
  onFiltersChange: (filters: DependencyFilterOptions) => void;
};

function FilterOptionsPopover({
  filters,
  availableTypes,
  availableCardTypes,
  onFiltersChange,
}: FilterOptionsPopoverProps) {
  return (
    <Box w="20rem" p="md">
      <Stack>
        <TypeFilterPicker
          filters={filters}
          availableTypes={availableTypes}
          availableCardTypes={availableCardTypes}
          onFiltersChange={onFiltersChange}
        />
        <LocationFilterPicker
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </Stack>
    </Box>
  );
}
