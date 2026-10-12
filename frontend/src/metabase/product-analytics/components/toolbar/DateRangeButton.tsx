import { useDisclosure } from "@mantine/hooks";

import { DatePicker } from "metabase/querying/common/components/DatePicker";
import { getDateFilterDisplayName } from "metabase/querying/filters/utils/dates";
import { Button, Icon, Popover } from "metabase/ui";

import { parseDateRange, serializeDateRange } from "../../date-range";
import type { SettingWidgetProps } from "../../settings/types";

export const DateRangeButton = ({
  value,
  onChange,
}: SettingWidgetProps<string>) => {
  const [opened, { open, close }] = useDisclosure();
  const dateRange = parseDateRange(value);

  return (
    <Popover
      opened={opened}
      onChange={(isOpened) => (isOpened ? open() : close())}
      position="bottom-end"
    >
      <Popover.Target>
        <Button variant="default" leftSection={<Icon name="calendar" />}>
          {dateRange !== undefined
            ? getDateFilterDisplayName(dateRange)
            : value}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <DatePicker
          value={dateRange}
          onChange={(newDateRange) => {
            onChange(serializeDateRange(newDateRange));
            close();
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
