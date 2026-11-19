import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  type ActionIconSize,
  Box,
  Button,
  FixedSizeIcon,
  Indicator,
  Popover,
  Stack,
} from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyFilterOptions } from "../../types";

import { LocationFilterPicker } from "./LocationFilterPicker";
import { TypeFilterPicker } from "./TypeFilterPicker";

type CompactSize = Extract<ActionIconSize, "sm" | "md">;

type FilterOptionsPickerProps = {
  filterOptions: DependencyFilterOptions;
  availableGroupTypes?: DependencyGroupType[];
  isDisabled?: boolean;
  hasDefaultFilterOptions?: boolean;
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
} & (
  | { isCompact?: false; compactSize?: never }
  | {
      isCompact: true;
      /** Size of the compact icon button; the full button keeps its size. */
      compactSize: CompactSize;
    }
);

export function FilterOptionsPicker({
  filterOptions,
  availableGroupTypes = [],
  isCompact = false,
  compactSize,
  isDisabled = false,
  hasDefaultFilterOptions = false,
  onFilterOptionsChange,
}: FilterOptionsPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <Indicator
          size={8}
          offset={getIndicatorOffset(isCompact, compactSize)}
          disabled={hasDefaultFilterOptions}
        >
          {isCompact ? (
            <ActionIcon
              variant="subtle"
              size={compactSize}
              aria-label={t`Filter`}
              disabled={isDisabled}
              onClick={toggle}
            >
              <FixedSizeIcon c="text-primary" name="filter" />
            </ActionIcon>
          ) : (
            <Button
              leftSection={<FixedSizeIcon name="filter" aria-hidden />}
              disabled={isDisabled}
              data-testid="dependency-filter-button"
              onClick={toggle}
            >
              {t`Filter`}
            </Button>
          )}
        </Indicator>
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
    <Box w="20rem" p="lg">
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

// Keeps the dot in the button's corner, clear of the icon, at each button size.
function getIndicatorOffset(isCompact: boolean, compactSize?: CompactSize) {
  if (!isCompact) {
    return 9;
  }
  return compactSize === "sm" ? 2 : 6;
}
