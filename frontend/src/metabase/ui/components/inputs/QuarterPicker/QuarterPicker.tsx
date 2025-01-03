import { Box, SimpleGrid } from "@mantine/core";
import {
  type DatePickerValue,
  MonthPicker,
  type MonthPickerProps,
  PickerControl,
} from "@mantine/dates";
import { useUncontrolled } from "@mantine/hooks";
import dayjs from "dayjs";
import { type Ref, forwardRef } from "react";

import S from "./QuarterPicker.module.css";

const QUARTERS = [1, 2, 3, 4];

export type QuarterPickerProps = MonthPickerProps;

export const QuarterPicker = forwardRef(function QuarterPicker(
  {
    value: valueProp,
    defaultValue,
    date: dateProp,
    defaultDate,
    level: levelProp,
    defaultLevel,
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
        miw="11rem"
        onChange={setValue}
        onDateChange={setDate}
        onLevelChange={setLevel}
      />
      {level === "year" && (
        <SimpleGrid cols={2} spacing="sm">
          {QUARTERS.map(quarter => (
            <QuarterPickerControl
              key={quarter}
              value={value}
              date={date}
              quarter={quarter}
              onChange={setValue}
            />
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
});

type QuarterPickerControlProps = {
  value: DatePickerValue;
  date: Date;
  quarter: number;
  onChange: (value: Date) => void;
};

function QuarterPickerControl({
  value,
  date,
  quarter,
  onChange,
}: QuarterPickerControlProps) {
  const isSelected =
    value != null && isSameYearQuarter(value, date.getFullYear(), quarter);

  const handleClick = () => {
    onChange(dayjs(date).quarter(quarter).startOf("quarter").toDate());
  };

  return (
    <PickerControl selected={isSelected} onClick={handleClick}>
      Q{quarter}
    </PickerControl>
  );
}

function isSameYearQuarter(value: Date, year: number, quarter: number) {
  const date = dayjs(value);
  return date.year() === year && date.quarter() === quarter;
}
