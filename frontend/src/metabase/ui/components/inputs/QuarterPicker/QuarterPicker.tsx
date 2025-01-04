import {
  type DatePickerType,
  type DatePickerValue,
  MonthPicker,
  type MonthPickerProps,
} from "@mantine/dates";
import { useUncontrolled } from "@mantine/hooks";
import cx from "classnames";
import dayjs from "dayjs";
import { type Ref, forwardRef } from "react";

import S from "./QuarterPicker.module.css";

export type QuarterPickerProps<T extends DatePickerType = "default"> =
  MonthPickerProps<T>;

export const QuarterPicker = forwardRef(function QuarterPicker<
  T extends DatePickerType = "default",
>(
  {
    classNames,
    value: valueProp,
    defaultValue,
    onChange,
    ...props
  }: QuarterPickerProps<T>,
  ref: Ref<HTMLDivElement>,
) {
  const [value, setValue] = useUncontrolled({
    value: valueProp,
    defaultValue,
    onChange,
  });

  return (
    <MonthPicker
      {...props}
      ref={ref}
      classNames={{
        monthsList: cx(S.monthsList, classNames?.monthsList),
        monthsListRow: cx(S.monthsListRow, classNames?.monthsListRow),
        monthsListCell: cx(S.monthsListCell, classNames?.monthsListCell),
      }}
      value={getValue(value)}
      monthsListFormat="[Q]Q"
      onChange={setValue}
    />
  );
});

function getValue<T extends DatePickerType, V extends DatePickerValue<T>>(
  value: V,
): V {
  if (Array.isArray(value)) {
    return value.map(date => (date ? getStartOfQuarter(date) : date)) as V;
  } else if (value) {
    return getStartOfQuarter(value) as V;
  } else {
    return value;
  }
}

function getStartOfQuarter(date: Date) {
  return dayjs(date).startOf("quarter").toDate();
}
