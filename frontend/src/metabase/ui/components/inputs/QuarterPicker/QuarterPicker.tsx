import {
  type DatePickerValue,
  MonthPicker,
  type MonthPickerProps,
  type PickerControlProps,
} from "@mantine/dates";
import { useUncontrolled } from "@mantine/hooks";
import cx from "classnames";
import dayjs from "dayjs";
import { type Ref, forwardRef } from "react";

import S from "./QuarterPicker.module.css";

export type QuarterPickerProps = MonthPickerProps;

export const QuarterPicker = forwardRef(function QuarterPicker(
  {
    classNames,
    value: valueProp,
    defaultValue,
    onChange,
    ...props
  }: QuarterPickerProps,
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
      value={getQuarterValue(value)}
      monthsListFormat="[Q]Q"
      onChange={setValue}
      getMonthControlProps={getMonthControlProps}
    />
  );
});

function getQuarterValue(value: DatePickerValue): DatePickerValue {
  return value ? dayjs(value).startOf("quarter").toDate() : null;
}

function getMonthControlProps(date: Date): Partial<PickerControlProps> {
  if (dayjs(date).month() !== dayjs(date).startOf("quarter").month()) {
    return { disabled: true, style: { display: "none" } };
  }
  return {};
}
