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

import type { SortColumn, SortDirection, SortOptions } from "../../types";

type SortOptionsPickerProps = {
  sortOptions: SortOptions;
  onSortOptionsChange: (sortOptions: SortOptions) => void;
};

export function SortOptionsPicker({
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
          sortOptions={sortOptions}
          onSortOptionsChange={onSortOptionsChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

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
  sortOptions: SortOptions;
  onSortOptionsChange: (sortOptions: SortOptions) => void;
};

function SortOptionsPopover({
  sortOptions,
  onSortOptionsChange,
}: SortOptionsPopoverProps) {
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
        <Stack mt="sm" gap="md">
          <Radio value="name" label={t`Name`} />
          <Radio value="location" label={t`Location`} />
          <Radio value="view_count" label={t`View count`} />
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
