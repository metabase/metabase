import { useState } from "react";

import { DatePicker } from "metabase/querying/common/components/DatePicker";
import type { DatePickerOperator } from "metabase/querying/common/types";
import { getDateFilterDisplayName } from "metabase/querying/filters/utils/dates";
import { serializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import { Button, Icon, Popover } from "metabase/ui";

import { parseDateRange } from "../../date-range";

/**
 * The operators dashboard date filters offer. "Is empty" and "Not empty" have
 * no date filter string.
 */
const DATE_RANGE_OPERATORS: DatePickerOperator[] = [
  "=",
  ">",
  "<",
  "between",
  "!=",
];

type DateRangeButtonProps = {
  /** A date filter in the format dashboard date filters use. */
  value: string;
  onChange: (value: string) => void;
};

export const DateRangeButton = ({ value, onChange }: DateRangeButtonProps) => {
  const [isOpened, setIsOpened] = useState(false);
  const dateRange = parseDateRange(value);

  return (
    <Popover opened={isOpened} position="bottom-end" onChange={setIsOpened}>
      <Popover.Target>
        <Button
          variant="default"
          leftSection={<Icon name="calendar" />}
          onClick={() => setIsOpened(!isOpened)}
        >
          {dateRange !== undefined
            ? getDateFilterDisplayName(dateRange)
            : value}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <DatePicker
          value={dateRange}
          availableOperators={DATE_RANGE_OPERATORS}
          onChange={(newDateRange) => {
            const newValue = serializeDateParameterValue(newDateRange);
            if (newValue !== value) {
              onChange(newValue);
            }
            setIsOpened(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
