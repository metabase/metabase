import { Box, SimpleGrid } from "@mantine/core";
import {
  MonthPicker,
  type MonthPickerProps,
  PickerControl,
  type PickerControlProps,
} from "@mantine/dates";
import { useUncontrolled } from "@mantine/hooks";
import dayjs from "dayjs";
import { type Ref, forwardRef } from "react";
import { c } from "ttag";

import S from "./QuarterPicker.module.css";

const QUARTERS = [1, 2, 3, 4];

export type QuarterPickerProps = Omit<MonthPickerProps, "monthListFormat"> & {
  quarterListFormat?: string;
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
  const [value, setValue] = useUncontrolled({
    value: valueProp,
    defaultValue,
    onChange,
  });

  const [date, setDate] = useUncontrolled({
    value: dateProp,
    defaultValue: defaultDate,
    finalValue: new Date(),
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
          yearLevel: S.yearLevel,
          monthsList: S.monthsList,
        }}
        value={value}
        date={date}
        level={level}
        getMonthControlProps={getMonthControlProps}
        onChange={setValue}
        onDateChange={setDate}
        onLevelChange={setLevel}
      />
      {level === "year" && (
        <SimpleGrid cols={2} spacing="sm">
          {QUARTERS.map(quarter => getQuarterDate(date, quarter)).map(
            (quarterDate, quarterIndex) => (
              <PickerControl
                key={quarterIndex}
                selected={value != null && isSelected(value, quarterDate)}
                onClick={() => setValue(quarterDate)}
              >
                {dayjs(quarterDate).format(quarterListFormat)}
              </PickerControl>
            ),
          )}
        </SimpleGrid>
      )}
    </Box>
  );
});

function getQuarterDate(date: Date, quarter: number) {
  return dayjs(date).quarter(quarter).startOf("quarter").toDate();
}

function getQuarterFormat() {
  return c(
    'This is a "dayjs" format string (https://day.js.org/docs/en/plugin/advanced-format). It should include "Q" for the quarter number, and raw text can be escaped by brackets. For example, "[Quarter] Q" will be rendered as "Quarter 1".',
  ).t`[Q]Q`;
}

function isSelected(value: Date, quarter: Date) {
  const date = dayjs(value);
  return date.isSame(quarter, "year") && date.isSame(quarter, "quarter");
}

function getMonthControlProps(): Partial<PickerControlProps> {
  return { disabled: true };
}
