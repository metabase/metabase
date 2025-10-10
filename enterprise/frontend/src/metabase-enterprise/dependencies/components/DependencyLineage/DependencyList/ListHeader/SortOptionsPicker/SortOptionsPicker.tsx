import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  Icon,
  Popover,
  Radio,
  SegmentedControl,
  type SegmentedControlItem,
  Stack,
  Tooltip,
} from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import type { SortColumn, SortDirection, SortOptions } from "../../types";
import { canSortByColumn } from "../../utils";

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
        <Tooltip label={t`Sort`}>
          <ActionIcon onClick={toggle}>
            <Icon name="sort" />
          </ActionIcon>
        </Tooltip>
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

const SORT_COLUMN_OPTIONS: SegmentedControlItem<SortColumn>[] = [
  {
    value: "view_count",
    get label() {
      return t`View count`;
    },
  },
  {
    value: "name",
    get label() {
      return t`Name`;
    },
  },
  {
    value: "location",
    get label() {
      return t`Location`;
    },
  },
];

const SORT_DIRECTION_OPTIONS: SegmentedControlItem<SortDirection>[] = [
  {
    value: "asc",
    get label() {
      return <Icon name="arrow_up" />;
    },
  },
  {
    value: "desc",
    get label() {
      return <Icon name="arrow_down" />;
    },
  },
];

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
  const columnOptions = SORT_COLUMN_OPTIONS.filter((option) =>
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
          {columnOptions.map((option) => (
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
        data={SORT_DIRECTION_OPTIONS}
        fullWidth
        onChange={handleDirectionChange}
      />
    </Stack>
  );
}
