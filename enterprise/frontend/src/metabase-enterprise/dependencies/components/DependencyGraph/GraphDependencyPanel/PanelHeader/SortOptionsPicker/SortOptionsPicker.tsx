import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  FixedSizeIcon,
  Popover,
  Radio,
  SegmentedControl,
  Stack,
} from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import type { SortColumn, SortDirection, SortOptions } from "../../types";
import { canSortByColumn } from "../../utils";

import { getSortColumnItems, getSortDirectionItems } from "./utils";

type SortOptionsPickerProps = {
  groupType: DependencyGroupType;
  sortOptions: SortOptions;
  onSortOptionsChange: (sortOptions: SortOptions) => void;
};

export function SortOptionsPicker({
  groupType,
  sortOptions,
  onSortOptionsChange,
}: SortOptionsPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <ActionIcon aria-label={t`Sort`} onClick={toggle}>
          <FixedSizeIcon c="text-primary" name="sort" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <SortOptionsPopover
          groupType={groupType}
          sortOptions={sortOptions}
          onSortOptionsChange={onSortOptionsChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type SortOptionsPopoverProps = {
  groupType: DependencyGroupType;
  sortOptions: SortOptions;
  onSortOptionsChange: (sortOptions: SortOptions) => void;
};

function SortOptionsPopover({
  groupType,
  sortOptions,
  onSortOptionsChange,
}: SortOptionsPopoverProps) {
  const columnItems = getSortColumnItems().filter((option) =>
    canSortByColumn(groupType, option.value),
  );

  const handleColumnChange = (column: string) => {
    onSortOptionsChange({ ...sortOptions, column: column as SortColumn });
  };

  const handleDirectionChange = (direction: string) => {
    onSortOptionsChange({
      ...sortOptions,
      direction: direction as SortDirection,
    });
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
