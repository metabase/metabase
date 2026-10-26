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
  const [opened, { close, toggle }] = useDisclosure();
  const dateRange = parseDateRange(value);

  return (
    <Popover
      opened={opened}
      // Controlled, so the target doesn't toggle it; the button does.
      onChange={(isOpened) => {
        if (!isOpened) {
          close();
        }
      }}
      position="bottom-end"
    >
      <Popover.Target>
        <Button
          variant="default"
          leftSection={<Icon name="calendar" />}
          onClick={toggle}
        >
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
