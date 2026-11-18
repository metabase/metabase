import { Box, SimpleGrid } from "@mantine/core";
import {
  type DateStringValue,
  MonthPicker,
  type MonthPickerProps,
  PickerControl,
} from "@mantine/dates";
import { useUncontrolled } from "@mantine/hooks";
import cx from "classnames";
// eslint-disable-next-line eslint-js/no-restricted-imports -- package build uses plain dayjs
import dayjs from "dayjs";
// eslint-disable-next-line eslint-js/no-restricted-imports -- package build uses plain dayjs
import advancedFormat from "dayjs/plugin/advancedFormat";
// eslint-disable-next-line eslint-js/no-restricted-imports -- package build uses plain dayjs
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import { type Ref, forwardRef } from "react";
import { c } from "ttag";

import CalendarS from "../Calendar/Calendar.module.css";

import S from "./QuarterPicker.module.css";

export type QuarterPickerProps = Omit<
  MonthPickerProps,
  "monthListFormat" | "getMonthControlProps" | "level" | "defaultLevel"
> & {
  quarterListFormat?: string;
  level?: Exclude<MonthPickerProps["level"], "month" | undefined>;
  defaultLevel?: Exclude<MonthPickerProps["level"], "month" | undefined>;
};

export const QuarterPicker = forwardRef(function QuarterPicker(
  {
    value: valueProp,
    defaultValue,
    date: dateProp,
    defaultDate,
    level: levelProp,
    defaultLevel,
    quarterListFormat = getQuarterFormat(),
    onChange,
    onDateChange,
    onLevelChange,
    ...props
  }: QuarterPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  const [value, setValue] = useUncontrolled<DateStringValue | null>({
    value: valueProp?.toString(),
    defaultValue: defaultValue?.toString(),
    onChange,
  });

  const [date, setDate] = useUncontrolled({
    value: dateProp?.toString(),
    defaultValue: defaultDate?.toString(),
    finalValue: value ?? new Date().toString(),
    onChange: onDateChange,
  });

  const [level, setLevel] = useUncontrolled({
    value: levelProp,
    defaultValue: defaultLevel,
    finalValue: "year" as const,
    onChange: onLevelChange,
  });

  return (
    <Box ref={ref} {...props}>
      <MonthPicker
        classNames={{
          monthsList: cx(CalendarS.monthsList, S.monthsList),
          yearsList: CalendarS.yearsList,
          yearsListCell: CalendarS.cell,
          yearsListRow: CalendarS.row,
        }}
        value={value}
        date={date}
        level={level}
        onChange={setValue}
        onDateChange={setDate}
        onLevelChange={setLevel}
      />
      {level === "year" && (
        <SimpleGrid cols={2} spacing="sm">
          {getQuarters(dayjs(date).toDate()).map((quarter, index) => (
            <PickerControl
              key={index}
              selected={value != null && isSelected(value, quarter)}
              onClick={() => setValue(dayjs(quarter).toISOString())}
            >
              {formatQuarter(quarter, quarterListFormat)}
            </PickerControl>
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
});

function registerDayjsPlugins() {
  // eslint-disable-next-line eslint-js/no-restricted-syntax -- register the plugin where it is used
  dayjs.extend(quarterOfYear);
  // eslint-disable-next-line eslint-js/no-restricted-syntax -- register the plugin where it is used
  dayjs.extend(advancedFormat);
}

function formatQuarter(quarter: Date, format: string) {
  registerDayjsPlugins();
  return dayjs(quarter).format(format);
}

function getQuarters(date: Date) {
  registerDayjsPlugins();
  return Array.from({ length: 4 }, (_, index) =>
    dayjs(date).startOf("year").add(index, "quarter").toDate(),
  );
}

function getQuarterFormat() {
  return c(
    'This is a "dayjs" format string (https://day.js.org/docs/en/plugin/advanced-format). It should include "Q" for the quarter number, and raw text can be escaped by brackets. For example, "[Quarter] Q" will be rendered as "Quarter 1".',
  ).t`[Q]Q`;
}

function isSelected(value: DateStringValue, quarter: Date) {
  registerDayjsPlugins();
  const date = dayjs(value);
  return date.isSame(quarter, "year") && date.isSame(quarter, "quarter");
}
