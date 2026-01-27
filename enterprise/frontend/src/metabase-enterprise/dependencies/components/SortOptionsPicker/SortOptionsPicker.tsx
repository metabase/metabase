import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  FixedSizeIcon,
  Indicator,
  Popover,
  Radio,
  SegmentedControl,
  Stack,
} from "metabase/ui";
import {
  DEPENDENCY_SORT_DIRECTIONS,
  type DependencySortColumn,
} from "metabase-types/api";

import type { DependencySortOptions } from "../../types";

import { getSortColumnItems, getSortDirectionItems } from "./utils";

type SortOptionsPickerProps = {
  sortOptions: DependencySortOptions;
  availableSortColumns: DependencySortColumn[];
  hasDefaultSortOptions?: boolean;
  onSortOptionsChange: (sortOptions: DependencySortOptions) => void;
};

export function SortOptionsPicker({
  sortOptions,
  availableSortColumns,
  hasDefaultSortOptions = false,
  onSortOptionsChange,
}: SortOptionsPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <Indicator disabled={hasDefaultSortOptions}>
          <ActionIcon aria-label={t`Sort`} onClick={toggle}>
            <FixedSizeIcon c="text-primary" name="sort" />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <SortOptionsPopover
          sortOptions={sortOptions}
          availableSortColumns={availableSortColumns}
          onSortOptionsChange={onSortOptionsChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type SortOptionsPopoverProps = {
  sortOptions: DependencySortOptions;
  availableSortColumns: DependencySortColumn[];
  onSortOptionsChange: (sortOptions: DependencySortOptions) => void;
};

function SortOptionsPopover({
  sortOptions,
  availableSortColumns,
  onSortOptionsChange,
}: SortOptionsPopoverProps) {
  const columnItems = getSortColumnItems(availableSortColumns);

  const handleColumnChange = (newValue: string) => {
    const newColumn = availableSortColumns.find(
      (column) => column === newValue,
    );
    if (newColumn != null) {
      onSortOptionsChange({ ...sortOptions, column: newColumn });
    }
  };

  const handleDirectionChange = (newValue: string) => {
    const newDirection = DEPENDENCY_SORT_DIRECTIONS.find(
      (direction) => direction === newValue,
    );
    if (newDirection != null) {
      onSortOptionsChange({ ...sortOptions, direction: newDirection });
    }
  };

  return (
    <Stack w="15rem" p="md" gap="lg">
      <Radio.Group
        value={sortOptions.column}
        label={t`Sort by`}
        onChange={handleColumnChange}
      >
        <Stack mt="sm" gap="sm">
          {columnItems.map((option) => (
            <Radio
              key={option.value}
              value={option.value}
              label={option.label}
            />
          ))}
        </Stack>
      </Radio.Group>
      <SegmentedControl
        value={sortOptions.direction}
        data={getSortDirectionItems()}
        size="sm"
        fullWidth
        onChange={handleDirectionChange}
      />
    </Stack>
  );
}
