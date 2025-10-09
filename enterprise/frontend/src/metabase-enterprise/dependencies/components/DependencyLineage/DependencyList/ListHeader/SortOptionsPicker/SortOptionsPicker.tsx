import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ActionIcon, Icon, Popover, Radio, Stack, Tooltip } from "metabase/ui";

import type { SortColumn, SortOptions } from "../../types";

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

  return (
    <Stack p="md" gap="lg">
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
    </Stack>
  );
}
